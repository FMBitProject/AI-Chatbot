import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { verifySlackSignature } from "@/lib/slack";
import { consumeQuestionQuota, isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { generateWithFallback } from "@/lib/models";
import { resolveByok } from "@/lib/byok";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { canUseAiAnswers } from "@/lib/pricing";

// Concise, but not looser. Slack's answers are the shortest this product gives
// and were governed by the weakest rule of the four channels — a single
// sentence, which a model can honour and still keep writing past. Brevity is a
// formatting preference; grounding is not, so the shared rules come first and
// "keep it short" is what is added on top.
const SYSTEM_PROMPT = `You are an internal AI assistant.

${GROUNDING_RULES}

Use exact terminology from the source documents. Respond in the same language as the user. If no relevant information is found, reply: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." Keep answers concise and professional.

${GROUNDING_REMINDER}`;

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

  const companyId = dbUser.companyId;

  // Slack is a full answering channel, so it runs the same plan rules as the
  // chat UI and the public API: effective plan (with grace period), frozen
  // seats, company quota and frozen documents.
  const { company, subscription, limits } = await resolvePlanById(companyId);

  // Same rule as the chat UI. Slack is a full answering channel, so leaving it
  // open would make the gate a suggestion: a Starter workspace would simply ask
  // from Slack instead. Ephemeral, because a plan notice is for the person who
  // typed the command, not for the channel.
  if (!canUseAiAnswers(subscription.plan)) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "🔒 Jawaban AI tersedia mulai paket berbayar. Paket gratis bisa memakai pencarian dokumen di aplikasi.",
    });
  }

  if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
    return NextResponse.json({ response_type: "ephemeral", text: `❌ ${SEAT_FROZEN_MESSAGE}` });
  }

  // Before the quota, for the reason spelled out in resolveByok: a key we cannot
  // decrypt is a standing failure, so charging a question for it would drain the
  // whole daily allowance into errors. This ran inside the deferred worker
  // below, i.e. after the meter had already counted the question.
  const byok = resolveByok(company);
  if (!byok.ok) {
    console.error(`[slack/command] BYOK key unreadable for company ${companyId}: ${byok.message}`);
    return NextResponse.json({ response_type: "ephemeral", text: `❌ ${byok.message}` });
  }

  const quotaFailure = await consumeQuestionQuota(companyId, limits);
  if (quotaFailure) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: quotaFailure.period === "daily"
        ? `❌ Kuota pertanyaan harian perusahaan sudah habis (${quotaFailure.limit}/hari). Coba lagi besok atau upgrade paket.`
        : `❌ Kuota pertanyaan bulanan perusahaan sudah habis (${quotaFailure.limit}/bulan). Upgrade paket untuk menambah kuota.`,
    });
  }

  fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text: "⏳ Sedang mencari jawaban..." }),
  }).catch(() => {});

  (async () => {
    const queryEmbedding = await getEmbedding(text, byok.gemini);
    const scored = (await withTenant(companyId, (tx) => retrieveChunks({
      companyId,
      queryEmbedding,
      maxDocuments: limits.maxDocuments,
    }, tx))).slice(0, 3);

    const context = scored.length > 0
      ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "Tidak ada dokumen tersedia.";

    const { text: answer } = await generateWithFallback({
      label: "slack/command",
      keys: { groq: byok.groq, gemini: byok.gemini },
      system: `${SYSTEM_PROMPT}\n\nKONTEKS:\n${context}`,
      temperature: RAG_TEMPERATURE,
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
