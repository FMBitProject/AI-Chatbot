import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

function getGoogle() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1",
  });
}

export async function getEmbedding(text: string): Promise<number[]> {
  const google = getGoogle();
  const { embedding } = await embed({
    model: google.textEmbeddingModel("text-embedding-004"),
    value: text.replace(/\n/g, " "),
  });
  return embedding;
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
