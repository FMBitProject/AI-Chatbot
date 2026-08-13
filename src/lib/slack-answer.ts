import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { generateWithFallback } from "@/lib/models";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";

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

Use exact terminology from the source documents. Respond in the same language as the user. If no relevant information is found, reply: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." Keep answers concise and professional.

${GROUNDING_REMINDER}`;

const MAX_SLACK_CHUNKS = 3;

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

  // De-duplicated, in retrieval order: several chunks commonly come from the
  // same document, and repeating its name in the footer would look like a
  // second, different source.
  const sources = [...new Set(scored.map((c) => c.documentName))];

  return { text, sources };
}
