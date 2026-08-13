import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { generateWithFallback } from "@/lib/models";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { escapeSlackText } from "@/lib/slack";

// The exact sentence the model is told to send when the documents do not
// answer the question, in both languages this product answers in.
//
// Named constants rather than literals inside the prompt because the footer
// logic below has to recognise them: the instruction and the check are one fact
// written twice, and if they ever drifted the symptom would be silent — a
// "not found" answer quietly carrying a source list again, which is the exact
// bug this pair of constants exists to close.
//
// The English variant is new. The prompt already said "respond in the same
// language as the user" and then supplied only the Indonesian sentence, so an
// English question was being asked to answer in English using a fixed
// Indonesian string — the model resolved that contradiction by improvising,
// which no check could have matched.
//
// `chat/route.ts` keeps its own copy in `notFoundMessage`, which additionally
// has individual-account wording ("dokumen Anda" rather than "dokumen internal
// perusahaan"). Not shared yet on purpose: Slack is company-only — an
// individual account has no workspace to install into — so those variants are
// unreachable from here, and hoisting the whole thing into @/lib/rag-prompt is
// a job worth doing on its own rather than inside a footer fix.
const NOT_FOUND_ID = "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan.";
const NOT_FOUND_EN = "Sorry, the information could not be found in the company's internal documents.";

// Shared between /api/slack/command and /api/slack/events so the two entry
// points cannot drift the way they had before this file existed — both used to
// carry their own copy of this prompt, word for word, enforced only by a
// comment asking whoever edited one to also edit the other.
//
// Concise, but not looser. Slack's answers are the shortest this product gives
// and were governed by the weakest rule of the four channels — a single
// sentence, which a model can honour and still keep writing past. Brevity is a
// formatting preference; grounding is not, so the shared rules come first and
// "keep it short" is what is added on top.
const SLACK_SYSTEM_PROMPT = `You are an internal AI assistant.

${GROUNDING_RULES}

Use exact terminology from the source documents. Respond in the same language as the user. If no relevant information is found, reply with exactly "${NOT_FOUND_ID}" for an Indonesian question or "${NOT_FOUND_EN}" for an English one, and nothing else. Keep answers concise and professional.

${GROUNDING_REMINDER}`;

const MAX_SLACK_CHUNKS = 3;

/**
 * Whether an answer is the not-found message and nothing else.
 *
 * Exact match after normalising, deliberately not `includes`. Rule 4 of the
 * grounding contract allows a partial answer — quote what the documents do
 * cover, then state plainly what they do not — and such an answer *does* rest
 * on documents; it merely contains this sentence as well. Only an answer that
 * is the message on its own means nothing was quoted.
 *
 * Normalising folds case and every run of non-letter, non-digit characters
 * into a single space, so only the words themselves have to match. That is
 * deliberately broad: a model reproducing a sentence it was handed does not
 * reproduce the punctuation reliably. The first version of this check listed
 * the characters to ignore by hand (`[\s"'*_.]`) and missed five of seven
 * realistic variants — the one that matters most being the curly apostrophe in
 * "company’s", which models emit far more often than the straight one the
 * constant is written with.
 *
 * Dropping punctuation cannot cause a false positive here: the comparison is
 * against a whole sentence, and two different sentences do not become equal
 * because their commas were removed.
 */
function isNotFoundAnswer(answer: string): boolean {
  const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const normalised = normalise(answer);
  return normalised === normalise(NOT_FOUND_ID) || normalised === normalise(NOT_FOUND_EN);
}

export interface SlackAnswerOptions {
  question: string;
  companyId: string;
  // The asker's department, exactly as /api/chat passes it to retrieveChunks —
  // Slack was previously the one channel that skipped this, which let an
  // employee pull another department's documents through the bot that the web
  // UI would never have shown them.
  department: string | null;
  maxDocuments: number;
  keys: { groq: string | null; gemini: string | null };
  label: string;
}

export interface SlackAnswer {
  text: string;
  sources: string[];
}

/**
 * Renders an answer as the message body both entry points post.
 *
 * Lives here for the reason this file exists at all: the escaping and the
 * source footer were briefly copied into both routes, differing only in
 * indentation, which is the arrangement the header comment above describes as
 * the thing this module was created to end. The slash command still prefixes
 * its own `*Pertanyaan:*` line — that part genuinely differs between the two —
 * but everything downstream of the answer is one implementation.
 *
 * Escaping belongs inside rather than at the call sites, so posting an answer
 * without it requires deliberately reaching past this function.
 */
export function formatSlackAnswer(answer: SlackAnswer): string {
  const footer = answer.sources.length > 0
    ? `\n\n_Sumber: ${answer.sources.map((name) => escapeSlackText(name)).join(", ")}_`
    : "";
  return `${escapeSlackText(answer.text)}${footer}`;
}

/**
 * Embeds, retrieves and generates one Slack answer — the same three steps
 * every answering channel runs, via the same shared primitives (see
 * @/lib/embeddings, @/lib/retrieval, @/lib/models).
 *
 * Returns the source document names alongside the text, which the old
 * per-route code discarded outright: the chat UI and /v1/query both let the
 * asker see what was quoted, and Slack answering from a customer's internal
 * documents with no way to check the source was the one channel that didn't.
 */
export async function answerForSlack(opts: SlackAnswerOptions): Promise<SlackAnswer> {
  const { question, companyId, department, maxDocuments, keys, label } = opts;

  const queryEmbedding = await getEmbedding(question, keys.gemini);
  const scored = (await withTenant(companyId, (tx) => retrieveChunks({
    companyId,
    queryEmbedding,
    department,
    maxDocuments,
  }, tx))).slice(0, MAX_SLACK_CHUNKS);

  const context = scored.length > 0
    ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
    : "Tidak ada dokumen tersedia.";

  const { text } = await generateWithFallback({
    label,
    keys,
    system: `${SLACK_SYSTEM_PROMPT}\n\nKONTEKS:\n${context}`,
    temperature: RAG_TEMPERATURE,
    prompt: question,
  });

  // An answer that found nothing cites nothing.
  //
  // `scored` is what retrieval *offered*, not what the answer used. Vector
  // search always returns its nearest neighbours, so a question the documents
  // do not cover still comes back with the closest few — and the footer was
  // built from that list alone. The result read as a citation for a refusal:
  // "informasi tidak ditemukan" followed by "Sumber: 3_SOP_Expense_
  // Reimbursement.pdf, 2_SOP_Pengajuan_Cuti_Leave.pdf", which invites the
  // reader to go open two documents that do not contain the answer, and quietly
  // undermines the refusal by dressing it as sourced.
  //
  // Nothing needed here for the empty-retrieval case: with no chunks the list
  // is already empty, which is why this only ever showed up when documents were
  // retrieved and then judged irrelevant.
  //
  // De-duplicated, in retrieval order: several chunks commonly come from the
  // same document, and repeating its name in the footer would look like a
  // second, different source.
  const sources = isNotFoundAnswer(text)
    ? []
    : [...new Set(scored.map((c) => c.documentName))];

  return { text, sources };
}
