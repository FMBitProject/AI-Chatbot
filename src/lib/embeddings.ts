import { embed, embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

function getGoogle(apiKey?: string | null) {
  return createGoogleGenerativeAI({
    apiKey: apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
  });
}

// Embeddings are reduced from the model's 3072-dim default to 1536 so they fit
// within pgvector's 2000-dim index limit (and cost less to store/compare).
// Cosine similarity is scale-invariant, so the un-normalized shorter vectors
// are fine for our cosine-distance search.
export const EMBEDDING_DIMENSIONS = 1536;

// How long a single embedding HTTP call may take before it is abandoned.
//
// Every timeout in this file exists for the same reason: an HTTP client with no
// deadline has no upper bound. A provider that refuses is easy — it returns a
// 429 or a 401 and the caller decides what to do. A provider that simply stops
// answering mid-request is the dangerous one, because nothing in the code notices
// anything is wrong; the call just never comes back.
//
// Two different budgets because the two callers have opposite priorities: a
// person is waiting on a query, while a document is being indexed by a machine
// that can afford to be patient. A normal batch answers in one to three seconds,
// so both numbers are far above anything healthy and only bite on a hang.
const QUERY_TIMEOUT_MS = 20_000;
const BATCH_TIMEOUT_MS = 60_000;

// Format a vector as a pgvector literal, e.g. "[0.1,0.2,...]".
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// Embed a search query. taskType RETRIEVAL_QUERY tells Gemini this is the
// question side of an asymmetric search, which improves match quality against
// document-side embeddings.
export async function getEmbedding(text: string, apiKey?: string | null): Promise<number[]> {
  const google = getGoogle(apiKey);
  const { embedding } = await embed({
    model: google.embedding("gemini-embedding-001"),
    value: text.replace(/\n/g, " "),
    // This one call sits in front of every question asked, through chat, Slack
    // and the public API alike. Without a deadline, a provider that stops
    // answering without refusing — no error, no 429, just silence — holds the
    // user's request open until the platform kills it, and the person waiting
    // sees a spinner rather than an apology. Failing at twenty seconds is worse
    // than a fast answer and far better than no answer at all.
    //
    // `abortSignal`, not the SDK's `timeout` setting: that one belongs to
    // generateText and streamText, and embed/embedMany do not accept it.
    abortSignal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY" },
    },
  });
  return embedding;
}

// True for the error a `timeout:` produces when it fires.
//
// Written out rather than imported: the AI SDK has exactly this helper, but only
// in @ai-sdk/provider-utils, which is a transitive dependency here — not one this
// project declares, and so not one whose contents it should be relying on. Three
// names is a cheap thing to own. `cause` is checked too because a provider may
// wrap the abort in its own error before it reaches us.
function isAbortError(err: unknown): boolean {
  const named = (e: unknown) =>
    (e instanceof Error || e instanceof DOMException) &&
    (e.name === "AbortError" || e.name === "TimeoutError" || e.name === "ResponseAborted");
  return named(err) || (err instanceof Error && named(err.cause));
}

/**
 * True when the provider said "too fast" rather than "no".
 *
 * The distinction decides whether a document goes back in the queue or is
 * marked failed for a person to deal with, so getting it wrong is expensive in
 * exactly the situation it matters most — a bulk import, where a rate limit is
 * not an edge case but the expected weather.
 *
 * It reads the status code, because the message does not carry one. Both call
 * sites used to test `err.message.includes("429")`, and Gemini's 429 body is:
 *
 *   "You exceeded your current quota, please check your plan and billing
 *    details. For more information on this error, head to: …/rate-limits"
 *
 * — nowhere in which do the digits 429 appear. The AI SDK puts the status on
 * `APICallError.statusCode` instead, so the check never fired: no backoff, no
 * requeue, and a perfectly healthy document marked "Failed" with a message
 * blaming an exhausted quota. Confirmed against the SDK's own error class,
 * which reports `statusCode: 429`, `isRetryable: true`, and a message
 * containing no "429".
 *
 * The text patterns stay as a fallback for whatever a provider or a proxy
 * wraps the error in on the way here. "Exceeded your current quota" is
 * deliberately included even though it can also mean a genuinely spent daily
 * allowance: a daily quota resets, so waiting is still the right response, and
 * it is never "your key is wrong" — the one conclusion that would send someone
 * to revoke a working key.
 */
export function isRateLimitError(err: unknown): boolean {
  // Walk one link of the cause chain: a provider may wrap the original.
  for (const candidate of [err, (err as { cause?: unknown })?.cause]) {
    if (candidate && typeof candidate === "object" && "statusCode" in candidate) {
      if ((candidate as { statusCode?: unknown }).statusCode === 429) return true;
    }
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  return (
    /\b429\b/.test(message) ||
    /exceeded your current quota|resource[_ ]exhausted|rate[ _-]?limit|too many requests/i.test(message)
  );
}

// Extract retry delay (seconds) from a Gemini 429 error message.
function parseRetryDelay(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(parseFloat(match[1])) + 2 : 35;
}

// Batch embed multiple texts in one API call instead of N sequential calls.
// Gemini embedding API supports up to 100 texts per batch request.
// Retries with the delay specified in the API's 429 response (typically 30s).
//
// Takes the company key for the same reason `getEmbedding` does, and it matters
// more here: this is the document side. A company that supplies its own key is
// buying isolation for the text it cares about most — whole SOPs, contracts,
// clinical pathways — and for a long time this function ignored the key and
// pushed every chunk through the platform account instead. The single question
// in `getEmbedding` was isolated; the entire document was not.
// Raised when the retry budget runs out, so the caller can tell "the provider
// kept saying slow down" apart from "the provider rejected us".
export class EmbeddingBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingBudgetExceededError";
  }
}

// How long this whole function may take, sleeping and calling together.
//
// It used to bound only the *sleeping* between 429 retries, which sounds like
// the same thing and is not. Sleep is the part we choose; the calls are the part
// the provider chooses, and a document is many batches. Two minutes of permitted
// sleep plus thirty unbounded requests has no upper limit at all, and the
// arithmetic that keeps a pass inside its 300-second invocation was quietly
// resting on requests being quick.
//
// Now the ceiling is real: an indexing pass spends at most this long on one
// document's embeddings, plus a bounded summary call, and the pass budget can be
// checked against numbers that mean something. Whatever is unfinished goes back
// to the queue, which costs a retry rather than a failure.
const CALL_BUDGET_MS = 120_000;

export async function getEmbeddings(texts: string[], apiKey?: string | null): Promise<number[][]> {
  const google = getGoogle(apiKey);
  const BATCH_SIZE = 100;
  const results: number[][] = [];
  const startedAt = Date.now();
  const spent = () => Date.now() - startedAt;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.replace(/\n/g, " "));

    // Checked between batches, where stopping is clean. Everything embedded so
    // far is discarded with the call — the document goes back to the queue and
    // starts over — so this is a real cost, not a free bail-out, and the budget
    // is set high enough that reaching it means something is wrong rather than
    // slow.
    if (spent() > CALL_BUDGET_MS) {
      throw new EmbeddingBudgetExceededError(
        `Embedding ran past its ${Math.round(CALL_BUDGET_MS / 1000)}s budget (chunk ${i} of ${texts.length})`,
      );
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { embeddings } = await embedMany({
          model: google.embedding("gemini-embedding-001"),
          values: batch,
          maxRetries: 0, // we handle retries ourselves
          // Per attempt, so a retry gets its own full deadline rather than
          // inheriting the exhausted one from the attempt before it.
          abortSignal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
          providerOptions: {
            google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
          },
        });
        results.push(...embeddings);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        // A timed-out request is reported as "too slow", not "broken". It is the
        // difference between a document the admin can wait for and one they are
        // told to fix, and there is nothing to fix — the provider was silent.
        // Deliberately not retried here: a call that has just hung for a minute
        // is not going to answer if asked again immediately, and the queue is a
        // better place to wait than a serverless invocation.
        if (isAbortError(err)) {
          throw new EmbeddingBudgetExceededError(
            `Embedding request timed out after ${Math.round(BATCH_TIMEOUT_MS / 1000)}s (chunk ${i} of ${texts.length})`,
          );
        }

        if (!isRateLimitError(err)) throw err;
        const delay = parseRetryDelay(err) * 1000;
        // Checked before sleeping, not after: a sleep that would overrun the
        // budget is one we should never start.
        if (spent() + delay > CALL_BUDGET_MS) {
          throw new EmbeddingBudgetExceededError(
            `Embedding rate-limited past its ${Math.round(CALL_BUDGET_MS / 1000)}s budget (chunk ${i} of ${texts.length})`,
          );
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (lastErr) throw lastErr;
  }

  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
