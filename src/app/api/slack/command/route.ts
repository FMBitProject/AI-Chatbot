import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentChunks, users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { getSlackClient, verifySlackSignature } from "@/lib/slack";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";

const SYSTEM_PROMPT = `Anda adalah asisten AI internal perusahaan. Jawab HANYA berdasarkan dokumen internal yang diberikan. Jika tidak ada informasi relevan, jawab: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." Gunakan bahasa yang sama dengan pengguna. Jawaban harus singkat dan padat.`;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";

  if (signingSecret && !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const userId = params.get("user_id") ?? "";
  const text = params.get("text")?.trim() ?? "";
  const responseUrl = params.get("response_url") ?? "";

  if (!text) {
    return NextResponse.json({ response_type: "ephemeral", text: "Gunakan: `/tanya <pertanyaan Anda>`" });
  }

  const [dbUser] = await db.select().from(users)
    .where(eq(users.email, `slack:${userId}`)).limit(1)
    .catch(() => [null]);

  if (!dbUser?.companyId) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "❌ Akun Slack Anda belum terhubung ke TanyaInternal. Hubungi admin perusahaan.",
    });
  }

  fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text: "⏳ Sedang mencari jawaban..." }),
  }).catch(() => {});

  (async () => {
    const queryEmbedding = await getEmbedding(text);
    const allChunks = await db
      .select({ id: documentChunks.id, text: documentChunks.text, embeddingJson: documentChunks.embeddingJson })
      .from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(eq(documentChunks.companyId, dbUser.companyId!));

    const scored = allChunks
      .filter((c) => c.embeddingJson)
      .map((c) => ({ ...c, score: cosineSimilarity(queryEmbedding, JSON.parse(c.embeddingJson!) as number[]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const context = scored.length > 0
      ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "Tidak ada dokumen tersedia.";

    const { text: answer } = await generateText({
      model: groq("llama-3.1-8b-instant"),
      system: `${SYSTEM_PROMPT}\n\nKONTEKS:\n${context}`,
      prompt: text,
    });

    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        text: `*Pertanyaan:* ${text}\n\n*Jawaban:*\n${answer}`,
      }),
    });
  })().catch(async () => {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text: "❌ Terjadi kesalahan. Silakan coba lagi." }),
    });
  });

  return new Response(null, { status: 200 });
}
