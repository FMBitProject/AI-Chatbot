import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { verifySlackSignature } from "@/lib/slack";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";

const SYSTEM_PROMPT = `You are an internal AI assistant. Answer ONLY based on the provided document context. Use exact terminology from the source documents. Respond in the same language as the user. If no relevant information is found, reply: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." Keep answers concise and professional.`;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";

  if (!signingSecret || !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
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
      text: "❌ Akun Slack Anda belum terhubung ke IntelliBase. Hubungi admin perusahaan.",
    });
  }

  fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text: "⏳ Sedang mencari jawaban..." }),
  }).catch(() => {});

  (async () => {
    const queryEmbedding = await getEmbedding(text);
    const companyId = dbUser.companyId!;
    const scored = (await withTenant(companyId, (tx) => retrieveChunks({ companyId, queryEmbedding }, tx))).slice(0, 3);

    const context = scored.length > 0
      ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "Tidak ada dokumen tersedia.";

    const { text: answer } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
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
