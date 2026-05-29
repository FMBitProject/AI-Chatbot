import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys, documentChunks, documents, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const key = authorization?.replace("Bearer ", "").trim();

  if (!key) return NextResponse.json({ error: "Missing API key" }, { status: 401 });

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.key, key)).limit(1);
  if (!apiKey) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));

  const { question, language = "id" } = await req.json() as { question: string; language?: string };
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  const queryEmbedding = await getEmbedding(question);
  const chunks = await db
    .select({ id: documentChunks.id, text: documentChunks.text, embeddingJson: documentChunks.embeddingJson })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documentChunks.companyId, apiKey.companyId));

  const scored = chunks
    .filter((c) => c.embeddingJson)
    .map((c) => ({ ...c, score: cosineSimilarity(queryEmbedding, JSON.parse(c.embeddingJson!) as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const context = scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
  const langRule = language === "en" ? "Respond in English." : "Jawab dalam Bahasa Indonesia.";

  const [company] = await db.select({ aiName: companies.aiName }).from(companies).where(eq(companies.id, apiKey.companyId)).limit(1);

  const { text } = await generateText({
    model: groq("llama-3.3-70b-versatile"),
    system: `You are ${company?.aiName ?? "IntelliBase AI"}, an internal company AI assistant. Answer ONLY based on the provided document context. ${langRule} If not found, say so clearly.`,
    prompt: `Context:\n${context}\n\nQuestion: ${question}`,
  });

  return NextResponse.json({
    answer: text,
    sources: scored.map((c) => ({ id: c.id, excerpt: c.text.slice(0, 200) })),
    model: "llama-3.3-70b-versatile",
  });
}
