import { GoogleGenerativeAI } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;

function getClient() {
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }
  return _client;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const model = getClient().getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text.replace(/\n/g, " "));
  return result.embedding.values;
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
