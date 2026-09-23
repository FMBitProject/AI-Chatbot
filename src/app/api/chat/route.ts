import { NextRequest } from "next/server";
import { streamText, generateText } from "ai";
import { billsOwnProvider, resolveByok } from "@/lib/byok";
import {
  INTERACTIVE_CHAIN,
  describeAiFailure,
  isRateLimitFailure,
  modelFor,
  usableChain,
  type ChainLink,
} from "@/lib/models";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { chatSessions, chatMessages, companies } from "@/lib/db/schema";
import { eq, count, and, gte, asc, desc } from "drizzle-orm";
import { LIMITS, isOneOf, optionalString, readJsonObject } from "@/lib/validate";
import { getEmbedding } from "@/lib/embeddings";
import { retrievalQueryFor } from "@/lib/follow-up";
import { retrieveChunks } from "@/lib/retrieval";
import { documentCatalog, catalogPrompt } from "@/lib/document-catalog";
import { ANSWER_STYLE, FOLLOW_UP_OFFER, GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE, MAX_OFFERABLE_BLOCK_CHARS, offerableDetails, offerableDetailsBlock } from "@/lib/rag-prompt";
import { canUseAiChat } from "@/lib/pricing";
import { getLimits } from "@/lib/plan-limits";
import { withTenant } from "@/lib/db/tenant";
import { consumeQuestionQuota, isSeatActive, refundQuestionQuota, resolvePlan, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { randomUUID } from "crypto";

// `describeAiFailure` used to live here, matching only the wording Groq uses.
// It moved to src/lib/models.ts when the chain gained a second provider: the
// classifier has to recognise Google's refusal too, and the three other
// answering channels need the same judgement to fall back at all.

// The "not found in your documents" line. It exists in one place because it is
// used twice in ways that must agree: the shortcut below sends it directly when
// the workspace has no documents at all, and the LANGUAGE RULE instructs the
// model to reproduce it verbatim when nothing matched. Two copies drifting apart
// would give the same situation two different answers depending on which path
// produced it.
//
// The individual wording matters more than it looks. An individual account has
// no "company internal documents" — being told their own uploads could not be
// found in a company's files is the moment the tier stops feeling like it was
// built for them.
function notFoundMessage(lang: "id" | "en", isIndividual: boolean): string {
  if (lang === "en") {
    return isIndividual
      ? "Sorry, the information could not be found in your documents."
      : "Sorry, the information could not be found in the company's internal documents.";
  }
  return isIndividual
    ? "Maaf, informasi tidak ditemukan dalam dokumen Anda."
    : "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan.";
}

function detectLang(text: string): "id" | "en" {
  const idPattern = /\b(apa|bagaimana|jelaskan|saya|yang|adalah|dan|dengan|untuk|ini|itu|tidak|bisa|cara|tolong|mohon|sebutkan|berikan|apakah|mengapa|kapan|siapa|dimana|berapa|boleh|perlu|harus|bisa|ingin|mau)\b/i;
  return idPattern.test(text) ? "id" : "en";
}

const SYSTEM_PROMPT = `You are an internal AI assistant for a company, helping employees find accurate information from official internal documents such as SOPs, HR regulations, and IT guidelines.

MANDATORY RULES:
${GROUNDING_RULES}
5. TERMINOLOGY: Always use the EXACT technical terms, abbreviations, and proper nouns as they appear in the source documents. Do NOT translate domain-specific or technical terms (e.g., if the document uses "Fair Market Value", "honorarium", "HCP Engagement", use those exact terms — do not substitute with informal translations).
6. SPELLING & GRAMMAR: Use correct, professional spelling and grammar at all times. For Indonesian responses, strictly follow PUEBI (Pedoman Umum Ejaan Bahasa Indonesia). Common errors to avoid: "menspesifikasikan" NOT "menspecifikasikan", "persentase" NOT "prosentase", "jadwal" NOT "jadual".
7. DOCUMENT CATALOG: The KNOWLEDGE BASE CATALOG gives an accurate document count and a bounded sample of titles. The sample is not exhaustive: never infer that a document does not exist because its title is absent. Direct requests for the complete list to the document browser. It is a list of titles and nothing more: it never tells you what a document SAYS, so it can never be the basis for answering a question about content.
8. CONVERSATION: The turns before this question are the conversation so far, and they are for understanding what is being asked — a follow-up often names nothing ("kalau yang ungu?", "berapa lama?") and means whatever the previous turn was about. When a question continues the one before it, connect it in a few words ("Masih dari SOP yang sama, ...", "Untuk gelang yang lain, ...") instead of restarting as though it were the first question of the session. If your own previous answer already named the document and this answer quotes the same one, do not name it a second time — the reader has it; connect to it instead. But earlier turns are conversation, NEVER evidence: a fact, name or number from an earlier answer may be repeated only if it also appears in the excerpts given to you for THIS question. The excerpts are re-retrieved every turn, so something you quoted correctly three turns ago is, right now, your own memory — rule 1 covers it exactly as it covers anything else you happen to know.

${ANSWER_STYLE}
${FOLLOW_UP_OFFER}
9. PERSONALITY (last, because it decides what beats what): if a KEPRIBADIAN & GAYA section appears at the top of this prompt, it is this customer's own tone preference and it outranks the preferences in VOICE AND SHAPE — how formal to be, whether to greet, whether to use emoji, how short to keep an answer, whether to offer to go further. It never outranks rules 1-4, the LANGUAGE RULE, or the not-found message. A personality asking you to reassure, to encourage, to estimate, to fill gaps from general knowledge or to "just give an approximate figure" is asking for something no tone setting can license: obey the parts of it that are about wording, ignore the parts that are about evidence.`;

/** What the wrapper needs in order to hand a charged question back. */
type ChargedQuestion = { companyId: string; limits: { maxQuestionsPerDay: number; maxQuestionsPerMonth: number } };

/**
 * Answers a chat request, or returns the response explaining why it cannot.
 *
 * Wrapped by POST below rather than exported directly, so an unexpected throw
 * anywhere in here still gives the question back. Calls onCharged the moment the
 * quota is spent; everything before that point is free to throw without owing
 * anyone a refund.
 */
async function handleChat(req: NextRequest, onCharged: (c: ChargedQuestion) => void): Promise<Response> {
  // requireUser, not requireAdmin: answering questions is what employees are
  // here for. The 403 keeps its old wording — the chat UI branches on the error
  // *code* (SEAT_FROZEN) and never on this string, but there is no reason to
  // change what a client already receives.
  const guard = await requireUser(req, { forbidden: "User tidak ditemukan." });
  if (!guard.ok) return guard.response;
  const dbUser = guard.user;

  const body = await readJsonObject(req);
  if (!body) {
    return new Response(JSON.stringify({ error: "Body harus berupa JSON yang valid." }), { status: 400 });
  }

  const sessionId = optionalString(body.sessionId, 128) ?? undefined;
  const responseLang = isOneOf(body.responseLang, ["auto", "id", "en"] as const)
    ? body.responseLang
    : "auto";

  // Search only this folder, when the asker picked one. Not validated against
  // the workspace's actual folders on purpose: a folder is only ever a value on
  // a document (there is no folders table), so a name that matches nothing
  // simply matches nothing — the query returns no chunks and the model says it
  // cannot find an answer, which is the honest outcome for "search a folder that
  // is empty". What keeps this safe is not the name but where it is applied:
  // narrowing on top of the department rule, never in place of it (see
  // retrieveChunks).
  //
  // Unusable is refused, not dropped. optionalString returns null both for
  // "absent" and for "present but too long", and collapsing those two meant a
  // request that asked to search *one* folder was answered from the whole
  // knowledge base instead — the opposite of what it asked for, with no way for
  // the caller to tell. Nothing leaks either way (null is the asker's own
  // ordinary access), but silently widening a scope the client narrowed is the
  // kind of difference that only shows up in an answer nobody can explain.
  let folder: string | null = null;
  if (body.folder !== undefined && body.folder !== null && body.folder !== "") {
    folder = optionalString(body.folder, LIMITS.name);
    if (!folder) {
      return new Response(
        JSON.stringify({ error: "INVALID_FOLDER", limit: LIMITS.name }),
        { status: 400 },
      );
    }
  }

  // Only the newest user message is taken from the request. Everything the model
  // is told about earlier turns is read back from the database further down —
  // see the note on `priorTurns`.
  const clientMessages = Array.isArray(body.messages) ? body.messages : null;
  if (!clientMessages) {
    return new Response(JSON.stringify({ error: "Format pesan tidak valid." }), { status: 400 });
  }

  const lastUserMessage = [...clientMessages].reverse().find(
    (m): m is { role: "user"; content: string } =>
      typeof m === "object" && m !== null &&
      (m as { role?: unknown }).role === "user" &&
      typeof (m as { content?: unknown }).content === "string" &&
      (m as { content: string }).content.trim().length > 0,
  );
  if (!lastUserMessage) {
    return new Response(JSON.stringify({ error: "Tidak ada pesan." }), { status: 400 });
  }

  // Bounded rather than truncated: a question past this length is a mistake or
  // an abuse, and silently answering the first 2,000 characters of it would hide
  // which. Unbounded, one request embeds and generates on megabytes while the
  // quota below counts it as a single question — the meter and the bill measure
  // different things.
  const question = lastUserMessage.content.trim();
  if (question.length > LIMITS.question) {
    return new Response(
      JSON.stringify({ error: "QUESTION_TOO_LONG", limit: LIMITS.question }),
      { status: 400 },
    );
  }

  // Fetch company and check quotas before doing any heavy processing.
  // resolvePlan applies the grace period and persists the downgrade once it is
  // over, so everything below runs on the plan that is actually in force.
  const [companyRow] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  const { company, subscription } = await resolvePlan(companyRow);

  // TODO: MINOR — gerbang ini fail-closed terhadap plan id yang tidak dikenal
  // isPaidPlan/canUseAiChat. Kalau nanti ada tier baru yang masuk PLAN_LIMITS dan
  // schema tapi lupa ditambahkan di pricing.ts, pelanggan BERBAYAR di tier itu
  // kehilangan chat sementara upload/kursi/dokumen tetap jalan — gejala yang
  // sangat sulit didiagnosis. Ikat ketiga daftar itu lewat assertion di
  // scripts/pricing.test.mts saat dirapikan.
  // Starter may chat within its quota. Keep this before the seat check,
  // per-user cap and consumeQuestionQuota: a refusal must not spend a question.
  // Check the stored plan too: resolvePlan normalizes missing/unknown plans to
  // Starter for limits, which must not turn corrupt plan data into chat access.
  // The effective plan still decides the allowance after a paid plan expires.
  if (!canUseAiChat(companyRow?.plan) || !canUseAiChat(subscription.plan)) {
    return new Response(
      JSON.stringify({ error: "AI_REQUIRES_PAID_PLAN", plan: subscription.plan }),
      { status: 403 },
    );
  }
  const companyId = dbUser.companyId;

  // BYOK keys are unwrapped here, ABOVE consumeQuestionQuota, and both halves of
  // that placement are deliberate.
  //
  // Above the quota, because a key we cannot decrypt is not a transient failure
  // the way a provider 429 is — it lasts until someone fixes BYOK_SECRET_KEY. A
  // customer would otherwise spend their entire daily allowance on requests that
  // charge them a question and then return 500.
  //
  // And as its own error rather than inside the embedding try below, because
  // that try answers with `provider: "gemini"` — which sent the admin to check
  // Google's status page for a problem that is entirely ours.
  //
  // It also now sits above the per-user cap rather than below it, because the
  // limits themselves depend on its answer: a company on its own keys has no
  // question caps to check (see getLimits).
  const byok = await resolveByok(company);
  if (!byok.ok) {
    console.error(`[chat] BYOK key unreadable for company ${companyId}: ${byok.message}`);
    return new Response(
      JSON.stringify({ error: "BYOK_KEY_UNREADABLE", message: byok.message }),
      { status: 503 }
    );
  }

  const limits = getLimits(subscription.plan, billsOwnProvider(byok));
  const { maxQuestionsPerDayPerUser, maxDocuments } = limits;

  // Seats above the effective plan's employee limit are frozen (see isSeatActive).
  if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
    return new Response(JSON.stringify({ error: "SEAT_FROZEN", message: SEAT_FROZEN_MESSAGE }), { status: 403 });
  }

  // Per-user fairness cap, checked BEFORE the company counter increments so a
  // capped user doesn't burn shared quota. Count-based like the monthly check.
  if (maxQuestionsPerDayPerUser !== -1) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [{ total: userDailyCount }] = await withTenant(companyId, (tx) => tx
      .select({ total: count() })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(
        eq(chatSessions.userId, dbUser.id),
        eq(chatMessages.role, "user"),
        gte(chatMessages.createdAt, startOfDay)
      )));

    if (userDailyCount >= maxQuestionsPerDayPerUser) {
      return new Response(
        JSON.stringify({ error: "QUOTA_EXCEEDED", limit: maxQuestionsPerDayPerUser, period: "daily-user" }),
        { status: 429 }
      );
    }
  }

  // The session has to be resolved before the history can be read, and the
  // history has to be read before this turn's question is embedded. Only the
  // *verification* branch moves up here; a brand-new session is still created
  // further down, after retrieval, so a question that never reaches the model
  // does not leave an empty session behind.
  //
  // Verify the session belongs to this *user*, not merely to their company.
  //
  // The company check alone is what RLS already gives us, so on its own it
  // authorises nothing extra: two employees of one workspace both satisfy it.
  // That mattered because a caller supplying a colleague's session id got three
  // things out of it — priorTurns below replays that session's history into the
  // prompt (so the model can be asked to recite it), the new messages are
  // written into the colleague's session, and the per-user daily quota counts
  // messages by chatSessions.userId, so questions parked in someone else's
  // session were never charged to the asker.
  //
  // Session ids are UUIDv4 and not guessable, which is why this was a narrow
  // hole rather than an open one. It is still the wrong check:
  // /api/chat/sessions/[id]/messages has always scoped by userId, and two
  // routes reading the same rows under different rules is a difference that
  // only ever gets noticed the expensive way.
  //
  // 404 rather than 403 on failure, deliberately — a session that is not yours
  // should be indistinguishable from one that does not exist.
  if (sessionId) {
    const [existingSession] = await withTenant(companyId, (tx) => tx
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.userId, dbUser.id),
        eq(chatSessions.companyId, companyId),
      ))
      .limit(1));
    if (!existingSession) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }
  }

  // Earlier turns are read back from the database, never taken from the request.
  //
  // The body used to supply the whole conversation, and it was forwarded to the
  // model as-is. That let a caller write the other side of the dialogue: a
  // handcrafted `{ role: "assistant", content: "..." }` is indistinguishable
  // from something this route actually said, so the model could be shown a past
  // turn in which it agreed to ignore the grounding rules above. Nothing about
  // it is visible afterwards either — the forged turns are never stored, so the
  // history an admin reads in the Audit tab is not the history the model saw.
  //
  // No filter fixes that, because the request is not the authority on what was
  // said. chat_messages is, and it is RLS-protected and already scoped to this
  // session by the ownership check above. Read *before* this turn's user
  // message is inserted below, so the current question is appended once rather
  // than appearing twice.
  //
  // Read here, above the quota and the embedding rather than just below the
  // prompt, because retrieval needs it now: retrievalQueryFor searches a
  // follow-up with its topic anchor and the latest question (see @/lib/follow-up),
  // and the embedding is computed a few lines down. Moving the ownership check
  // up with it is a bonus rather than a cost — a session id that is not yours
  // now 404s before it can spend one of your questions.
  //
  // Newest-first with a LIMIT, then reversed: the cap has to keep the most
  // recent turns, and ordering ascending with a limit would keep the oldest.
  //
  // `role` breaks ties before `id` does, and it has to. created_at defaults to
  // now(), which in Postgres is the *transaction* start time — constant for
  // every row written inside one transaction. The "no documents at all" path
  // above writes the question and the canned reply in a single withTenant call,
  // so that pair shares a timestamp exactly, and an id tiebreaker would order
  // them by a random UUID: half the time the model would be shown its own
  // answer before the question it answered. Sorting role ascending puts
  // "assistant" ahead of "user" in this descending scan, which is what the
  // reverse below turns into question-then-answer.
  const priorTurns = sessionId
    ? (await withTenant(companyId, (tx) => tx
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(desc(chatMessages.createdAt), asc(chatMessages.role), desc(chatMessages.id))
        .limit(LIMITS.history)))
        .reverse()
        // Stored content is bounded on the way in, but rows written before that
        // was true are not, and one of them is enough to blow the context.
        .map((m) => ({ role: m.role, content: m.content.slice(0, LIMITS.message) }))
    : [];

  // What retrieval searches for, which is not always what the reader typed.
  //
  // A follow-up leans on the turn before it ("kalau yang ungu?"), and the
  // retriever sees one question at a time. Searching those four words alone
  // returns whatever the corpus keeps near "ungu" and answers a question the
  // documents cover with "tidak ditemukan" — which is the single thing that
  // makes a chat feel like a search box with a transcript above it.
  //
  // Retrieval only. `question` itself is untouched: it is what gets stored,
  // what the model is asked, and what the grounding rules apply to. A wider
  // search finds better excerpts; it does not widen what may be answered.
  const previousQuestions = priorTurns.filter((m) => m.role === "user").map((m) => m.content);
  const searchText = retrievalQueryFor(question, previousQuestions);

  // Company-wide daily + monthly quota, shared with the public API and Slack.
  const quotaFailure = await consumeQuestionQuota(companyId, limits);
  if (quotaFailure) {
    return new Response(
      JSON.stringify({ error: "QUOTA_EXCEEDED", limit: quotaFailure.limit, period: quotaFailure.period }),
      { status: 429 }
    );
  }
  // From here on the question is paid for, so POST owes a refund for anything
  // that throws. The two explicit refunds further down cover the failures this
  // function understands; the wrapper covers the ones it does not.
  onCharged({ companyId, limits });

  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(searchText, byok.gemini);
  } catch (err) {
    // The question was charged one line above and no answer will come of it, so
    // it goes back. Nothing about a Gemini outage is the reader's doing, and a
    // Starter workspace has 30 a month to lose.
    await refundQuestionQuota(companyId, limits, "chat");
    const is429 = err instanceof Error && err.message.includes("429");
    return new Response(
      JSON.stringify({ error: is429 ? "AI_RATE_LIMIT" : "AI_ERROR", provider: "gemini" }),
      { status: 503 }
    );
  }

  const { catalog, rankedChunks } = await withTenant(companyId, async (tx) => {
    const catalog = await documentCatalog({ companyId, access: dbUser, folder, maxDocuments }, tx);
    const rankedChunks = await retrieveChunks({
      companyId,
      queryEmbedding,
      access: dbUser,
      folder,
      limit: 30,
      expandParents: true,
      maxDocuments,
    }, tx);

    return { catalog, rankedChunks };
  });

  const docCatalog = catalogPrompt(catalog);

  // How much retrieved text may go into the prompt, measured rather than
  // guessed.
  //
  // This was the constant 36,000, derived once from "12,000 TPM minus about
  // 3,000 tokens of everything else". The arithmetic was right when it was
  // written and it had no way to stay right: the reserve was a number in a
  // comment, so growing the system prompt by a few hundred tokens silently
  // overspent it. That is exactly what happened — adding the grounding rules
  // pushed a request to 12,232 tokens against a 12,000 limit, and Groq refused
  // the whole call. The user saw an empty answer bubble.
  //
  // So the fixed part is now weighed instead of assumed. Everything already
  // known at this point — the rules, the catalogue (which grows with the
  // customer's document count), the persona, the language block — is counted
  // for real. Only the two parts not yet built are reserved for, and generously.
  //
  // CHARS_PER_TOKEN is 3.5, not the 4 the old comment used. Four is about right
  // for plain English prose and too optimistic for what this product actually
  // indexes: Indonesian, clinical terminology, dosages, citations and numbers
  // all tokenize worse. The old estimate is part of why a budget that looked
  // like 9,000 tokens arrived as more.
  const TPM_LIMIT_TOKENS = 12_000;   // Groq free tier, per organization
  const OUTPUT_RESERVE_TOKENS = 1_200;
  const CHARS_PER_TOKEN = 3.5;
  const SAFETY = 0.95;               // tokenizer estimates are estimates
  const HISTORY_RESERVE_CHARS = 6_000; // replayed turns + this question

  // A pointer back to the persona, not a second copy of it.
  //
  // The persona sits at the very top of the prompt and the style rules sit
  // thousands of tokens below it, so on a short question the style rules simply
  // won: a workspace that had asked for no opener and no closing offer got both
  // anyway. The instruction nearest the question is the one that survives — the
  // same reason GROUNDING_REMINDER exists at all.
  //
  // What is repeated here is a reference ("follow the section above"), never the
  // customer's own text. Persona text is the one part of this prompt a customer
  // writes, and the end of the prompt is its strongest position; pasting it
  // there would hand the admin page the last word over the grounding rules,
  // which is exactly what rule 9 spends a paragraph refusing.
  const personaReminder = company?.aiPersonality
    ? "Also remember the KEPRIBADIAN & GAYA section at the top: it is this customer's tone preference and it "
      + "outranks the tone preferences in VOICE AND SHAPE — including whether to open with a greeting, whether to "
      + "close with an offer, and how long an answer should be. It does not outrank rules 1-4 or the not-found message."
    : "";

  const promptOverheadChars =
    SYSTEM_PROMPT.length + GROUNDING_REMINDER.length + docCatalog.length +
    personaReminder.length + MAX_OFFERABLE_BLOCK_CHARS +
    (company?.aiPersonality?.length ?? 0) + (company?.aiName?.length ?? 0) +
    800; // language block + section headers, both small and fixed
  // The menu is not built until excerpts are selected. Its bounded formatter
  // includes its header in MAX_OFFERABLE_BLOCK_CHARS, reserved above.

  const inputBudgetChars =
    (TPM_LIMIT_TOKENS - OUTPUT_RESERVE_TOKENS) * SAFETY * CHARS_PER_TOKEN;

  // Floored rather than allowed to go negative: a customer with a very large
  // catalogue would otherwise get a budget below zero, no excerpts at all, and
  // a confident "not found" for a question their documents do answer. A small
  // budget degrades the answer; a negative one silently changes what is true.
  const MAX_CONTEXT_CHARS = Math.max(
    4_000,
    Math.floor(inputBudgetChars - promptOverheadChars - HISTORY_RESERVE_CHARS),
  );

  // Take the best-scoring chunks, capped by count first and by the token budget
  // second.
  //
  // The count cap is new and it is the larger change. Selection used to be
  // bounded only by MAX_CONTEXT_CHARS, which on this corpus meant about
  // eighteen chunks — three to four times what retrieval-augmented generation
  // normally sends, and the reason a single question cost nearly nine thousand
  // tokens against a twelve-thousand-per-minute ceiling.
  //
  // Eight is not a compromise on quality so much as a bet against noise. The
  // chunks arrive sorted by cosine similarity, so numbers nine through eighteen
  // are the weakest matches by construction; including them asks the model to
  // find the answer inside a larger pile of near-misses, and the grounding rules
  // it must follow get harder to obey the more plausible-but-irrelevant text
  // sits next to them. Fewer, better excerpts is the more common finding.
  //
  // It stays a named constant because it is a dial worth turning against a real
  // corpus rather than a truth: raise it if answers start missing things a
  // document plainly says, lower it if the rate limit still binds.
  const MAX_CONTEXT_CHUNKS = 8;
  // Cap at 5 unique documents to avoid irrelevant sources
  const MAX_UNIQUE_DOCS = 5;
  const scored: typeof rankedChunks = [];
  const seenDocs = new Set<string>();
  let totalChars = 0;
  for (const c of rankedChunks) {
    if (scored.length >= MAX_CONTEXT_CHUNKS) break;
    if (totalChars + c.text.length > MAX_CONTEXT_CHARS) continue;
    if (!seenDocs.has(c.documentId)) {
      if (seenDocs.size >= MAX_UNIQUE_DOCS) continue;
      seenDocs.add(c.documentId);
    }
    scored.push(c);
    totalChars += c.text.length;
  }

  // Group chunks by document so the AI sees them as coherent sections
  const byDoc = new Map<string, typeof scored>();
  for (const c of scored) {
    const key = c.documentId;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key)!.push(c);
  }

  let activeSessionId = sessionId;
  if (!activeSessionId) {
    activeSessionId = randomUUID();
    const newSessionId = activeSessionId;
    await withTenant(companyId, (tx) => tx.insert(chatSessions).values({
      id: newSessionId,
      userId: dbUser.id,
      companyId,
      title: question.slice(0, 60),
    }));
  }

  // Stable, non-null handle to the session id for use inside withTenant closures
  // (activeSessionId is a reassignable `let`, which loses its narrowing there).
  const resolvedSessionId = activeSessionId;

  // Only bail out early when there are truly no documents at all in the knowledge base.
  // If there are documents but no relevant chunks (e.g. a meta-question like "how many docs?"),
  // continue to the AI so it can answer from the catalog.
  if (scored.length === 0 && catalog.total === 0) {
    const effectiveLang = responseLang === "auto" ? detectLang(question) : (responseLang ?? "id");
    const noDocMsg = notFoundMessage(effectiveLang, company?.accountType === "individual");

    const noDocMsgId = randomUUID();
    await withTenant(companyId, async (tx) => {
      await tx.insert(chatMessages).values({ id: randomUUID(), sessionId: resolvedSessionId, role: "user", content: question });
      await tx.insert(chatMessages).values({ id: noDocMsgId, sessionId: resolvedSessionId, role: "assistant", content: noDocMsg, citationsJson: "[]" });
    });

    // The question goes back. No model was asked anything here — the reply is a
    // constant, chosen because the workspace has no documents at all — so
    // charging for it bills someone for a sentence this file already knew.
    //
    // It lands on exactly the people least able to absorb it: a Starter
    // workspace has 30 questions a month, and the days before anyone uploads
    // anything are the days every question takes this path. A trial could spend
    // its whole allowance being told there is nothing to search.
    //
    // Only this shortcut, not the model-produced "not found". When the catalog
    // does have documents the model is asked, answers, and reports that nothing
    // matched — a real generation on real content, charged like any other.
    //
    // After the inserts rather than before them, so this cannot double-refund:
    // a throw above still leaves the give-back to POST's catch, and by the time
    // control reaches here nothing else can fail before the response returns.
    await refundQuestionQuota(companyId, limits, "chat");

    const encoder2 = new TextEncoder();
    const { readable: r2, writable: w2 } = new TransformStream<Uint8Array, Uint8Array>();
    const writer2 = w2.getWriter();
    (async () => {
      await writer2.write(encoder2.encode(`2:${JSON.stringify({ citations: [], messageId: noDocMsgId, sessionId: activeSessionId })}\n`));
      await writer2.write(encoder2.encode(`0:${JSON.stringify(noDocMsg)}\n`));
      await writer2.close();
    })();
    return new Response(r2, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const contextText = byDoc.size > 0
    ? Array.from(byDoc.entries())
        .map(([, chunks]) => {
          const docName = chunks[0].documentName;
          const body = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
          return `=== ${docName} ===\n${body}`;
        })
        .join("\n\n")
    // The old text here read "answer from the catalog above if relevant", which
    // is an instruction to answer a content question from a list of filenames —
    // and the only way to do that is to supply the content from memory. It was
    // the most direct invitation on the page to do the one thing rule 1
    // forbids, sitting in the section the model reads as its evidence.
    : "(NO EXCERPTS RETRIEVED. Nothing in this workspace matched the question closely enough to be quoted. "
      + "You therefore have no evidence for any question about what the documents say: answer with the "
      + "not-found message from the LANGUAGE RULE and stop. The catalog above lists titles only — it can "
      + "still answer questions about which documents exist, never about their contents.)";

  // The closed list the closing offer has to choose from (see rag-prompt.ts).
  //
  // Built from `scored` — the chunks that were actually quoted — rather than
  // from the catalogue or the whole document, because the offer has to be
  // honourable by the very excerpts in this prompt. Offering something that is
  // in the document but not in the excerpts fails for the same reason inventing
  // it does: the next turn retrieves afresh and may still not see it.
  //
  // Empty when nothing could be extracted, and empty is a working state: the
  // block disappears and FOLLOW_UP_OFFER's "if the list is absent or empty …
  // end with no offer" takes over.
  const offerable = offerableDetailsBlock(offerableDetails(scored));

  const solo = company?.accountType === "individual";
  const notFoundId = notFoundMessage("id", solo);
  const notFoundEn = notFoundMessage("en", solo);

  const aiName = company?.aiName ?? "IntelliBase AI";
  const aiPersonality = company?.aiPersonality ? `\n\nKEPRIBADIAN & GAYA:\n${company.aiPersonality}` : "";

  const langInstruction = responseLang === "en"
    ? `LANGUAGE RULE (ABSOLUTE — OVERRIDES ALL OTHER RULES):
You MUST write your ENTIRE response in ENGLISH only.
Do NOT use any Indonesian words. Do NOT mix languages.
Even if the user writes in Indonesian, your response MUST be 100% in English.
If no relevant information is found in the documents, respond with exactly: "${notFoundEn}"
Violation of this rule is not acceptable under any circumstance.`
    : responseLang === "id"
    ? `ATURAN BAHASA (MUTLAK — MENGGANTIKAN SEMUA ATURAN LAIN):
Anda WAJIB menulis SELURUH respons dalam Bahasa Indonesia yang baik dan benar.
JANGAN gunakan kata-kata dalam bahasa Inggris kecuali istilah teknis dari dokumen.
Jika informasi tidak ditemukan dalam dokumen, balas dengan: "${notFoundId}"
Tidak ada pengecualian untuk aturan ini.`
    : `LANGUAGE RULE (AUTO-DETECT):
Detect the language of the user's question and respond in that SAME language.
- User writes in Indonesian → respond entirely in Indonesian.
- User writes in English → respond entirely in English.
- Do NOT mix languages in a single response.
If no relevant information is found:
- Indonesian question → "${notFoundId}"
- English question → "${notFoundEn}"`;

  const langReminder = responseLang === "en"
    ? "Remember: respond in ENGLISH only, regardless of the question language."
    : responseLang === "id"
    ? "Ingat: respons dalam BAHASA INDONESIA saja, terlepas dari bahasa pertanyaan."
    : "Remember: detect the user's question language and respond in that same language.";

  const systemPromptWithContext = `You are ${aiName}, an internal AI assistant.${aiPersonality}\n\n${SYSTEM_PROMPT}\n\n${langInstruction}\n\n---\n${docCatalog}\n\n---\nINTERNAL DOCUMENT CONTEXT (relevant excerpts):\n${contextText}\n---\n${offerable ? `\n${offerable}\n---\n` : ""}\n${GROUNDING_REMINDER}\n\n${personaReminder ? `${personaReminder}\n\n` : ""}${langReminder}`;

  const userMsgId = randomUUID();
  await withTenant(companyId, (tx) => tx.insert(chatMessages).values({
    id: userMsgId,
    sessionId: resolvedSessionId,
    role: "user",
    content: question,
  }));

  const citations = scored.map((c) => ({ id: c.id, text: c.text, documentName: c.documentName }));
  const assistantMsgId = randomUUID();

  const langDemo =
    responseLang === "en"
      ? [
          { role: "user" as const, content: "What language will you use to answer me?" },
          { role: "assistant" as const, content: "I will answer entirely in English, regardless of the language of the documents or your question. This is my strict rule for this session." },
        ]
      : responseLang === "id"
      ? [
          { role: "user" as const, content: "Bahasa apa yang akan kamu gunakan untuk menjawab saya?" },
          { role: "assistant" as const, content: "Saya akan menjawab seluruhnya dalam Bahasa Indonesia yang baik dan benar, terlepas dari bahasa dokumen atau pertanyaan. Ini adalah aturan sesi ini." },
        ]
      : [
          { role: "user" as const, content: "What language will you use?" },
          { role: "assistant" as const, content: "I will automatically detect the language of your question and respond in that same language. Ask in Indonesian and I will answer in Indonesian; ask in English and I will answer in English." },
        ];

  const messagesWithLang = [
    ...priorTurns,
    ...langDemo,
    { role: "user" as const, content: question },
  ];

  // Both providers' keys, resolved once. The chain below can end on a different
  // provider than it started on, so a single Groq client is no longer enough.
  const providerKeys = byok;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    let closed = false;
    const closeWriter = async () => { if (!closed) { closed = true; await writer.close(); } };

    try {
      await writer.write(encoder.encode(`2:${JSON.stringify({ citations, messageId: assistantMsgId, sessionId: activeSessionId })}\n`));

      let fullText = "";
      let lastError: unknown;
      // Whether a model finished a generation cleanly. Tracked separately from
      // `fullText` because "there is text on screen" and "the answer is
      // complete" are different questions, and only the second one may persist.
      let answered = false;
      // Which model actually produced the answer, so the follow-up questions can
      // be asked of the same one. They were hardcoded to the top model, which
      // meant they failed precisely when a fallback had just happened — the top
      // model being metered out is the whole reason we were on the second one —
      // and the reader who most needed the conversation to keep moving was the
      // one who silently got no suggestions.
      let answeredBy: ChainLink | null = null;

      // The chain, its ordering and the evidence behind each link live in
      // src/lib/models.ts, which is also where the other three answering
      // channels get theirs. Filtered to the links this workspace can actually
      // reach: a provider with no key fails on credentials rather than a rate
      // limit, which would end the chain early and report the wrong reason.
      //
      // Falling back is only allowed when the attempt produced nothing AND was
      // refused for rate limiting. Two guards, both necessary. Once a token has
      // reached the browser the answer is already half-rendered and a second
      // model would continue someone else's sentence. And a refusal that is not
      // a rate limit — a bad key, a malformed request — will fail identically on
      // every model, so retrying only delays an error that has to be shown.
      const chain = usableChain(INTERACTIVE_CHAIN, providerKeys);

      // Which link failed last, so the error frame names the provider that
      // actually refused. Reporting "groq" after Gemini turned us down sends an
      // admin to the wrong status page.
      let lastProvider: ChainLink["provider"] = chain[0]?.provider ?? "groq";

      for (const [attempt, link] of chain.entries()) {
        let attemptError: unknown;
        lastProvider = link.provider;
        const result = streamText({
          model: modelFor(link, providerKeys),
          system: systemPromptWithContext,
          messages: messagesWithLang,
          temperature: RAG_TEMPERATURE,
          // Captured here because the SDK does not always surface a provider
          // refusal by rejecting textStream: a request rejected before
          // generation starts ends the stream cleanly with nothing in it.
          onError: ({ error }) => { attemptError = error; },
        });

        let attemptText = "";
        try {
          for await (const chunk of result.textStream) {
            attemptText += chunk;
            fullText += chunk;
            await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
          }
        } catch (err) {
          attemptError = err;
        }

        if (attemptText.trim()) {
          // Text AND no error is the only success. Text *with* an error is a
          // generation that died mid-sentence, and treating it as success —
          // which this loop did until now — is worse than the empty bubble it
          // replaced: the browser keeps a half-finished answer, the row is
          // written to chat history as though complete, and the follow-up
          // questions are generated from a fragment. Nothing anywhere says it
          // was cut off. On a knowledge base whose answers carry doses and
          // thresholds, an answer that stops after "dosis maksimalnya adalah"
          // is not a partial answer, it is a wrong one.
          //
          // No fallback either: tokens have already reached the browser, so a
          // second model would continue a sentence it never started.
          if (!attemptError) {
            if (attempt > 0) console.log(`[chat] answered by fallback model ${link.id}`);
            answered = true;
            answeredBy = link;
            break;
          }
          lastError = attemptError;
          console.error(`[chat] ${link.id} failed after emitting ${attemptText.length} chars:`, attemptError);
          break;
        }

        lastError = attemptError;
        const canFallBack = attempt < chain.length - 1 && isRateLimitFailure(attemptError);
        console.error(
          `[chat] ${link.id} produced nothing${canFallBack ? ", falling back" : ""}:`,
          attemptError,
        );
        if (!canFallBack) break;
      }

      // Nothing usable: every model refused, one failed for a reason retrying
      // cannot fix, or a generation died partway. Two shapes of failure end up
      // here and the client renders both the same way — the error frame replaces
      // whatever text had arrived, which is the point when that text is a
      // fragment.
      //
      // "Ended cleanly with nothing in it" is the shape these refusals actually
      // take: "Request too large … tokens per minute (TPM): Limit 12000,
      // Requested 12232" never rejects the stream. Without this the browser is
      // handed silence and renders an empty bubble, which reads as a broken page
      // rather than a limit that was hit.
      if (!answered) {
        // Every model refused, or a generation died partway and its text is
        // about to be replaced by the error frame. Either way the reader ends
        // up with no answer, so the question they were charged for goes back.
        //
        // Deliberately not in the `answered` path below: an answer that arrived
        // and then failed to save is still an answer that arrived, and refunding
        // it would let a reader keep the reply *and* the question.
        await refundQuestionQuota(companyId, limits, "chat");
        await writer.write(encoder.encode(`1:${JSON.stringify(describeAiFailure(lastError, lastProvider))}\n`));
        await closeWriter();
        return;
      }

      // Persisted here rather than in an onFinish callback, which would have
      // fired once per attempt — writing a row for a model that answered
      // nothing, or racing two rows when a fallback succeeded.
      //
      // Wrapped, because this block has a `finally` and no `catch`: an
      // unavailable database would otherwise throw past the suggestions, close
      // the stream mid-flight and surface as an unhandled rejection. The answer
      // is already in the reader's hands by now; losing the history row is bad
      // and losing the rest of the response on top of it is worse.
      try {
        await withTenant(companyId, (tx) => tx.insert(chatMessages).values({
          id: assistantMsgId,
          sessionId: resolvedSessionId,
          role: "assistant",
          content: fullText,
          citationsJson: JSON.stringify(citations),
        }));
      } catch (err) {
        console.error(`[chat] answer delivered but not saved (session=${resolvedSessionId}):`, err);
      }

      // Generate suggested follow-up questions — silently skip if this fails
      try {
        const effectiveSuggestLang = responseLang === "auto" ? detectLang(question) : (responseLang ?? "id");
        const suggestLang = effectiveSuggestLang === "en" ? "English" : "Bahasa Indonesia";
        const { text: suggestionsRaw } = await generateText({
          // The model that just answered, so the suggestions come from the one
          // provider we know is currently letting us through. No fallback of its
          // own: this is a nicety wrapped in a silent catch, and it must not
          // spend a second provider's quota on the way to being discarded.
          model: modelFor(answeredBy ?? chain[0], providerKeys),
          prompt: `Based on this Q&A, generate exactly 3 short follow-up questions a user might ask next. Return ONLY a JSON array of 3 strings, no explanation. Write questions in ${suggestLang}.

Question: ${question}
Answer: ${fullText.slice(0, 500)}

Return format: ["question 1", "question 2", "question 3"]`,
        });

        const match = suggestionsRaw.match(/\[[\s\S]*\]/);
        if (match) {
          const suggestions = JSON.parse(match[0]) as string[];
          await writer.write(encoder.encode(`3:${JSON.stringify(suggestions.slice(0, 3))}\n`));
        }
      } catch {}
    } finally {
      await closeWriter();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * The route itself: handleChat, plus the refund it cannot make for itself.
 *
 * Between the quota charge and the first token there are eight awaits against
 * the database — the retrieval transaction, the session lookup and insert, the
 * history read, the user-message insert — and none of them was inside a
 * try/catch. An unavailable database there charged the reader for a question,
 * refunded nothing, and escaped as Next's own non-JSON 500, which the chat page
 * can only render as "Maaf, terjadi kesalahan".
 *
 * A holder object rather than a bare let, because TypeScript narrows a variable
 * assigned only inside a callback back to null at the catch and would then
 * reject the refund below.
 *
 * The streaming half is deliberately not covered here: it runs in a detached
 * async function that has already returned this response, so nothing it throws
 * can reach this catch. Its own failure path refunds where it needs to.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const state: { charged: ChargedQuestion | null } = { charged: null };
  try {
    return await handleChat(req, (c) => { state.charged = c; });
  } catch (error) {
    console.error("[chat] Unhandled failure before streaming:", error);
    if (state.charged) {
      await refundQuestionQuota(state.charged.companyId, state.charged.limits, "chat");
    }
    // Shaped like this route's other refusals — a code in `error`, which
    // readApiError understands. The chat page has no branch for 500, so it falls
    // through to its generic "Maaf, terjadi kesalahan. Silakan coba lagi.", which
    // is the honest thing to say about a database that is not answering.
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), { status: 500 });
  }
}
