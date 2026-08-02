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
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY" },
    },
  });
  return embedding;
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

// How long this function may spend sleeping between 429 retries, across the
// whole call. Per batch the old code could sleep 5 × ~35s, and a document is
// many batches — enough to run past the upload route's own 300s limit and get
// the request killed mid-write, which leaves the document row stranded in
// "processing" because a killed function runs neither the success path nor the
// catch. Failing on our own terms while there is still time to record it is
// strictly better than being cut off.
const RETRY_BUDGET_MS = 120_000;

export async function getEmbeddings(texts: string[], apiKey?: string | null): Promise<number[][]> {
  const google = getGoogle(apiKey);
  const BATCH_SIZE = 100;
  const results: number[][] = [];
  let sleptMs = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.replace(/\n/g, " "));

    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { embeddings } = await embedMany({
          model: google.embedding("gemini-embedding-001"),
          values: batch,
          maxRetries: 0, // we handle retries ourselves
          providerOptions: {
            google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
          },
        });
        results.push(...embeddings);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        const isRateLimit =
          err instanceof Error && err.message.includes("429");
        if (!isRateLimit) throw err;
        const delay = parseRetryDelay(err) * 1000;
        // Checked before sleeping, not after: a sleep that would overrun the
        // budget is one we should never start.
        if (sleptMs + delay > RETRY_BUDGET_MS) {
          throw new EmbeddingBudgetExceededError(
            `Embedding rate-limited for more than ${Math.round(RETRY_BUDGET_MS / 1000)}s (chunk ${i} of ${texts.length})`,
          );
        }
        sleptMs += delay;
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
