import { NextRequest } from "next/server";
import { streamText, generateText } from "ai";
import { groq, createGroq } from "@ai-sdk/groq";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { chatSessions, chatMessages, documents, companies } from "@/lib/db/schema";
import { eq, count, and, gte, isNull, or, inArray, asc, desc } from "drizzle-orm";
import { LIMITS, isOneOf, optionalString, readJsonObject } from "@/lib/validate";
import { getEmbedding } from "@/lib/embeddings";
import { activeDocumentIds, notExpired, retrieveChunks } from "@/lib/retrieval";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { withTenant } from "@/lib/db/tenant";
import { consumeQuestionQuota, isSeatActive, resolvePlan, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { randomUUID } from "crypto";

/**
 * Turns whatever the model provider threw into the two codes the chat page
 * already knows how to render.
 *
 * Shared by the two paths a generation can fail on — a rejected stream and a
 * stream that ends empty — because they are the same failure to the person
 * waiting, and previously only one of them said anything.
 *
 * The rate-limit test looks for the words Groq actually uses. Its TPM refusal
 * is "Request too large for model … tokens per minute (TPM): Limit 12000,
 * Requested 12232", which contains neither "429" nor the phrase "rate limit" —
 * the same class of mistake as matching a Gemini 429 on its message text. The
 * distinction is worth keeping: AI_RATE_LIMIT tells the reader to wait a moment
 * and try again, which is true and actionable; AI_ERROR tells them something
 * broke, which for an over-long request is neither.
 */
function describeAiFailure(err: unknown): { error: string; provider: string } {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  const isRateLimit =
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("quota") ||
    msg.includes("tokens per minute") ||
    msg.includes("request too large");
  return { error: isRateLimit ? "AI_RATE_LIMIT" : "AI_ERROR", provider: "groq" };
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
7. TONE: Maintain a formal, professional tone appropriate for a corporate internal knowledge base.
8. FORMAT: Use clear formatting — bold for key terms/headings, bullet points for steps or lists, numbered lists for sequential procedures.
9. DOCUMENT CATALOG: The KNOWLEDGE BASE CATALOG section lists the documents available in this knowledge base. It answers questions ABOUT the documents — how many there are, what they are called, whether one exists. It is a list of titles and nothing more: it never tells you what a document SAYS, so it can never be the basis for answering a question about content.`;

export async function POST(req: NextRequest) {
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
  const { company, limits } = await resolvePlan(companyRow);
  const { maxQuestionsPerDayPerUser, maxDocuments } = limits;

  const companyId = dbUser.companyId;

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

  // Company-wide daily + monthly quota, shared with the public API and Slack.
  const quotaFailure = await consumeQuestionQuota(companyId, limits);
  if (quotaFailure) {
    return new Response(
      JSON.stringify({ error: "QUOTA_EXCEEDED", limit: quotaFailure.limit, period: quotaFailure.period }),
      { status: 429 }
    );
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(question, company?.geminiApiKey);
  } catch (err) {
    const is429 = err instanceof Error && err.message.includes("429");
    return new Response(
      JSON.stringify({ error: is429 ? "AI_RATE_LIMIT" : "AI_ERROR", provider: "gemini" }),
      { status: 503 }
    );
  }

  // Document catalog + relevant chunks both read the RLS-protected documents /
  // document_chunks tables, so they run together inside one tenant-scoped
  // transaction (see withTenant).
  const { catalogRows, rankedChunks } = await withTenant(companyId, async (tx) => {
    // Every document the user can see (shared or their own department), so the
    // AI can still answer "how many documents?"-style meta-questions even when
    // no chunk is retrieved. Documents frozen by the plan limit are left out
    // here too, so the catalog matches what can actually be answered from.
    const activeIds = await activeDocumentIds(companyId, maxDocuments, tx);
    // notExpired() for the same reason the retriever applies it: the catalog is
    // what the model is told it can answer from, so listing a document the
    // retriever will never return invites exactly the confident answer about a
    // withdrawn document that an expiry date exists to prevent.
    const catalogConditions = [eq(documents.companyId, companyId), notExpired()];
    if (dbUser.department) {
      catalogConditions.push(or(isNull(documents.department), eq(documents.department, dbUser.department))!);
    }
    // The catalog has to be narrowed by the folder as well, for the same reason
    // it is narrowed by expiry: it is the list the model is told it can answer
    // from. Leave it whole while the retriever searches one folder and the model
    // will happily name a document from another and be asked about it next.
    if (folder) {
      catalogConditions.push(eq(documents.department, folder));
    }
    if (activeIds !== null) {
      catalogConditions.push(inArray(documents.id, activeIds));
    }

    const catalogRows = activeIds !== null && activeIds.length === 0
      ? []
      : await tx.select({ name: documents.name }).from(documents).where(and(...catalogConditions));

    // Relevant chunks via the shared pgvector retriever (department-scoped, 0.5
    // similarity threshold, ordered by the HNSW index in the database).
    const rankedChunks = await retrieveChunks({
      companyId,
      queryEmbedding,
      department: dbUser.department,
      folder,
      limit: 30,
      maxDocuments,
    }, tx);

    return { catalogRows, rankedChunks };
  });

  const docCatalogNames = [...new Set(catalogRows.map((r) => r.name))].sort();
  const docCatalog = docCatalogNames.length > 0
    ? `KNOWLEDGE BASE CATALOG — ${docCatalogNames.length} document(s) available:\n${docCatalogNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`
    : "KNOWLEDGE BASE CATALOG: No documents available.";

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

  const promptOverheadChars =
    SYSTEM_PROMPT.length + GROUNDING_REMINDER.length + docCatalog.length +
    (company?.aiPersonality?.length ?? 0) + (company?.aiName?.length ?? 0) +
    800; // language block + section headers, both small and fixed

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

  // Take as many top-scored chunks as fit within the token budget
  // Cap at 5 unique documents to avoid irrelevant sources
  const MAX_UNIQUE_DOCS = 5;
  const scored: typeof rankedChunks = [];
  const seenDocs = new Set<string>();
  let totalChars = 0;
  for (const c of rankedChunks) {
    if (totalChars + c.text.length > MAX_CONTEXT_CHARS) break;
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
  } else {
    // Verify the session belongs to this user's company before writing messages into it
    const existingSessionId = activeSessionId;
    const [existingSession] = await withTenant(companyId, (tx) => tx
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, existingSessionId), eq(chatSessions.companyId, companyId)))
      .limit(1));
    if (!existingSession) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }
  }

  // Stable, non-null handle to the session id for use inside withTenant closures
  // (activeSessionId is a reassignable `let`, which loses its narrowing there).
  const resolvedSessionId = activeSessionId;

  // Only bail out early when there are truly no documents at all in the knowledge base.
  // If there are documents but no relevant chunks (e.g. a meta-question like "how many docs?"),
  // continue to the AI so it can answer from the catalog.
  if (scored.length === 0 && docCatalogNames.length === 0) {
    const effectiveLang = responseLang === "auto" ? detectLang(question) : (responseLang ?? "id");
    const noDocMsg = effectiveLang === "en"
      ? "Sorry, the information could not be found in the company's internal documents."
      : "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan.";

    const noDocMsgId = randomUUID();
    await withTenant(companyId, async (tx) => {
      await tx.insert(chatMessages).values({ id: randomUUID(), sessionId: resolvedSessionId, role: "user", content: question });
      await tx.insert(chatMessages).values({ id: noDocMsgId, sessionId: resolvedSessionId, role: "assistant", content: noDocMsg, citationsJson: "[]" });
    });

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

  const aiName = company?.aiName ?? "IntelliBase AI";
  const aiPersonality = company?.aiPersonality ? `\n\nKEPRIBADIAN & GAYA:\n${company.aiPersonality}` : "";

  const langInstruction = responseLang === "en"
    ? `LANGUAGE RULE (ABSOLUTE — OVERRIDES ALL OTHER RULES):
You MUST write your ENTIRE response in ENGLISH only.
Do NOT use any Indonesian words. Do NOT mix languages.
Even if the user writes in Indonesian, your response MUST be 100% in English.
If no relevant information is found in the documents, respond with exactly: "Sorry, the information could not be found in the company's internal documents."
Violation of this rule is not acceptable under any circumstance.`
    : responseLang === "id"
    ? `ATURAN BAHASA (MUTLAK — MENGGANTIKAN SEMUA ATURAN LAIN):
Anda WAJIB menulis SELURUH respons dalam Bahasa Indonesia yang baik dan benar.
JANGAN gunakan kata-kata dalam bahasa Inggris kecuali istilah teknis dari dokumen.
Jika informasi tidak ditemukan dalam dokumen, balas dengan: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan."
Tidak ada pengecualian untuk aturan ini.`
    : `LANGUAGE RULE (AUTO-DETECT):
Detect the language of the user's question and respond in that SAME language.
- User writes in Indonesian → respond entirely in Indonesian.
- User writes in English → respond entirely in English.
- Do NOT mix languages in a single response.
If no relevant information is found:
- Indonesian question → "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan."
- English question → "Sorry, the information could not be found in the company's internal documents."`;

  const langReminder = responseLang === "en"
    ? "Remember: respond in ENGLISH only, regardless of the question language."
    : responseLang === "id"
    ? "Ingat: respons dalam BAHASA INDONESIA saja, terlepas dari bahasa pertanyaan."
    : "Remember: detect the user's question language and respond in that same language.";

  const systemPromptWithContext = `You are ${aiName}, an internal AI assistant.${aiPersonality}\n\n${SYSTEM_PROMPT}\n\n${langInstruction}\n\n---\n${docCatalog}\n\n---\nINTERNAL DOCUMENT CONTEXT (relevant excerpts):\n${contextText}\n---\n\n${GROUNDING_REMINDER}\n\n${langReminder}`;

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
        .where(eq(chatMessages.sessionId, resolvedSessionId))
        .orderBy(desc(chatMessages.createdAt), asc(chatMessages.role), desc(chatMessages.id))
        .limit(LIMITS.history)))
        .reverse()
        // Stored content is bounded on the way in, but rows written before that
        // was true are not, and one of them is enough to blow the context.
        .map((m) => ({ role: m.role, content: m.content.slice(0, LIMITS.message) }))
    : [];

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

  const groqClient = company?.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;

  // Set by onError below. The AI SDK does not always surface a provider refusal
  // by rejecting textStream — a request rejected before generation starts ends
  // the stream cleanly with nothing in it — so the error has to be captured
  // where it is raised and checked after the loop.
  let streamError: unknown;

  const result = streamText({
    model: groqClient("llama-3.3-70b-versatile"),
    system: systemPromptWithContext,
    messages: messagesWithLang,
    temperature: RAG_TEMPERATURE,
    // Reported, not swallowed. A failed generation used to reach the browser as
    // a completed stream carrying no text: the for-await below ended without
    // throwing, the catch never ran, and the page rendered an empty bubble with
    // follow-up suggestions under it. The provider's refusal was logged on the
    // server and nowhere else, so the one person who could act on it — the
    // admin watching a blank answer — was told nothing at all.
    onError: ({ error }) => {
      streamError = error;
      console.error("[chat] generation failed:", error);
    },
    onFinish: async ({ text }) => {
      // An empty completion is not an answer and must not become one row of
      // chat history. It would also be replayed to the model as a past turn in
      // which the assistant said nothing.
      if (!text.trim()) return;
      // Runs after the stream completes, so it gets its own short tenant-scoped
      // transaction rather than being held open across the LLM response.
      await withTenant(companyId, (tx) => tx.insert(chatMessages).values({
        id: assistantMsgId,
        sessionId: resolvedSessionId,
        role: "assistant",
        content: text,
        citationsJson: JSON.stringify(citations),
      }));
    },
  });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    let closed = false;
    const closeWriter = async () => { if (!closed) { closed = true; await writer.close(); } };

    try {
      await writer.write(encoder.encode(`2:${JSON.stringify({ citations, messageId: assistantMsgId, sessionId: activeSessionId })}\n`));

      let fullText = "";
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk;
          await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
        }
      } catch (err) {
        await writer.write(encoder.encode(`1:${JSON.stringify(describeAiFailure(err))}\n`));
        await closeWriter();
        return;
      }

      // A stream that ended cleanly with nothing in it is a failure too, and it
      // is the shape this provider's refusals actually take: "Request too large
      // … tokens per minute (TPM): Limit 12000, Requested 12232" never reaches
      // the catch above. Without this the browser is handed silence and renders
      // an empty bubble, which reads as a bug in the page rather than a limit
      // that was hit — and leaves the reader unsure whether the blank space is
      // the answer.
      if (!fullText.trim()) {
        await writer.write(encoder.encode(`1:${JSON.stringify(describeAiFailure(streamError))}\n`));
        await closeWriter();
        return;
      }

      // Generate suggested follow-up questions — silently skip if this fails
      try {
        const effectiveSuggestLang = responseLang === "auto" ? detectLang(question) : (responseLang ?? "id");
        const suggestLang = effectiveSuggestLang === "en" ? "English" : "Bahasa Indonesia";
        const { text: suggestionsRaw } = await generateText({
          model: groqClient("llama-3.3-70b-versatile"),
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
