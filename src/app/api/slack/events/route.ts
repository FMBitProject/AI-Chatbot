import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { getSlackClient, verifySlackSignature } from "@/lib/slack";
import { consumeQuestionQuota, isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE, type Company } from "@/lib/subscription";
import { generateText } from "ai";
import { groq, createGroq } from "@ai-sdk/groq";

const SYSTEM_PROMPT = `You are an internal AI assistant. Answer ONLY based on the provided document context. Use exact terminology from the source documents. Respond in the same language as the user. If no relevant information is found, reply: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." Keep answers concise and professional.`;

// Takes the whole company row rather than just its id: Slack is a full
// question-answering channel like the chat UI and the public API, so it has to
// honour the same BYOK keys. It previously used the platform key for both the
// embedding and the generation, which meant an Enterprise customer's Slack
// traffic quietly bypassed the keys they had configured.
async function runRAG(question: string, companyId: string, maxDocuments: number, company: Company | undefined): Promise<string> {
  const queryEmbedding = await getEmbedding(question, company?.geminiApiKey);

  const scored = (await withTenant(companyId, (tx) => retrieveChunks({
    companyId,
    queryEmbedding,
    maxDocuments,
  }, tx))).slice(0, 3);

  const context = scored.length > 0
    ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
    : "Tidak ada dokumen tersedia.";

  const groqClient = company?.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;
  const { text } = await generateText({
    model: groqClient("llama-3.3-70b-versatile"),
    system: `${SYSTEM_PROMPT}\n\nKONTEKS:\n${context}`,
    prompt: question,
  });

  return text;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";

  if (!signingSecret || !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    type: string;
    challenge?: string;
    event?: {
      type: string;
      text?: string;
      user?: string;
      channel?: string;
      ts?: string;
      bot_id?: string;
    };
  };

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === "event_callback" && body.event) {
    const event = body.event;
    if (event.bot_id || event.type !== "app_mention") {
      return NextResponse.json({ ok: true });
    }

    const slackUserId = event.user ?? "";
    const channel = event.channel ?? "";
    const question = (event.text ?? "").replace(/<@[^>]+>/g, "").trim();

    if (!question) return NextResponse.json({ ok: true });

    const [dbUser] = await db.select().from(users)
      .where(eq(users.email, `slack:${slackUserId}`)).limit(1)
      .catch(() => [null]);

    const companyId = dbUser?.companyId;
    if (!companyId) {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: "❌ Akun Slack Anda belum terhubung ke IntelliBase. Hubungi admin perusahaan.",
      });
      return NextResponse.json({ ok: true });
    }

    // Same plan rules as the chat UI and the public API (see resolvePlan).
    const { company, limits } = await resolvePlanById(companyId);

    if (dbUser && !(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `❌ ${SEAT_FROZEN_MESSAGE}`,
      });
      return NextResponse.json({ ok: true });
    }

    const quotaFailure = await consumeQuestionQuota(companyId, limits);
    if (quotaFailure) {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: quotaFailure.period === "daily"
          ? `❌ Kuota pertanyaan harian perusahaan sudah habis (${quotaFailure.limit}/hari). Coba lagi besok atau upgrade paket.`
          : `❌ Kuota pertanyaan bulanan perusahaan sudah habis (${quotaFailure.limit}/bulan). Upgrade paket untuk menambah kuota.`,
      });
      return NextResponse.json({ ok: true });
    }

    getSlackClient().chat.postMessage({
      channel,
      thread_ts: event.ts,
      text: "⏳ Sedang mencari jawaban dari dokumen internal...",
    }).catch(() => {});

    runRAG(question, companyId, limits.maxDocuments, company).then(async (answer) => {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: answer,
      });
    }).catch(async () => {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: "❌ Terjadi kesalahan. Silakan coba lagi.",
      });
    });
  }

  return NextResponse.json({ ok: true });
}
