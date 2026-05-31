import { embed, embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

function getGoogle() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
  });
}

export async function getEmbedding(text: string): Promise<number[]> {
  const google = getGoogle();
  const { embedding } = await embed({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    value: text.replace(/\n/g, " "),
  });
  return embedding;
}

// Batch embed multiple texts in one API call instead of N sequential calls.
// Gemini embedding API supports up to 100 texts per batch request.
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const google = getGoogle();
  const BATCH_SIZE = 100;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => t.replace(/\n/g, " "));
    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      values: batch,
    });
    results.push(...embeddings);
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
