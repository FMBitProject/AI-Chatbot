import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { getSlackClient, verifySlackSignature } from "@/lib/slack";
import { consumeQuestionQuota, isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE, type Company } from "@/lib/subscription";
import { generateWithFallback } from "@/lib/models";
import { resolveByok } from "@/lib/byok";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { canUseAiAnswers } from "@/lib/pricing";

// Same prompt as /api/slack/command, and the two are kept identical on purpose:
// a mention and a slash command are the same question asked two ways, and a
// person who gets different answers from them has no way to know why. See the
// note there about brevity not being a reason to loosen grounding.
const SYSTEM_PROMPT = `You are an internal AI assistant.

${GROUNDING_RULES}

Use exact terminology from the source documents. Respond in the same language as the user. If no relevant information is found, reply: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." Keep answers concise and professional.

${GROUNDING_REMINDER}`;

// Takes the whole company row rather than just its id: Slack is a full
// question-answering channel like the chat UI and the public API, so it has to
// honour the same BYOK keys. It previously used the platform key for both the
// embedding and the generation, which meant an Enterprise customer's Slack
// traffic quietly bypassed the keys they had configured.
// Takes already-resolved keys rather than resolving them itself. Unwrapping has
// to happen before the caller consumes the quota — see the call site — and a
// function that both needs the keys and is invoked after the meter has run is
// the shape that made that mistake easy.
type ResolvedKeys = { groq: string | null; gemini: string | null };

async function runRAG(question: string, companyId: string, maxDocuments: number, company: Company | undefined, keys: ResolvedKeys): Promise<string> {
  const queryEmbedding = await getEmbedding(question, keys.gemini);

  const scored = (await withTenant(companyId, (tx) => retrieveChunks({
    companyId,
    queryEmbedding,
    maxDocuments,
  }, tx))).slice(0, 3);

  const context = scored.length > 0
    ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
    : "Tidak ada dokumen tersedia.";

  const { text } = await generateWithFallback({
    label: "slack/events",
    keys,
    system: `${SYSTEM_PROMPT}\n\nKONTEKS:\n${context}`,
    temperature: RAG_TEMPERATURE,
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
    const { company, subscription, limits } = await resolvePlanById(companyId);

    // Answers are a paid feature; a mention and a slash command must agree about
    // that, or the gate is only as strong as whichever entry point was forgotten.
    if (!canUseAiAnswers(subscription.plan)) {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: "🔒 Jawaban AI tersedia mulai paket berbayar. Paket gratis bisa memakai pencarian dokumen di aplikasi.",
      });
      return NextResponse.json({ ok: true });
    }

    if (dbUser && !(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `❌ ${SEAT_FROZEN_MESSAGE}`,
      });
      return NextResponse.json({ ok: true });
    }

    // Before the quota, for the reason spelled out in resolveByok: a key we
    // cannot decrypt is a standing failure, not a passing one. Charging a
    // question for it would drain the whole daily allowance into errors —
    // every mention would spend a question and answer "Terjadi kesalahan"
    // until an operator fixed BYOK_SECRET_KEY. /api/chat and /v1/query already
    // resolve here; this route ran it inside runRAG, after the meter.
    const byok = resolveByok(company);
    if (!byok.ok) {
      console.error(`[slack/events] BYOK key unreadable for company ${companyId}: ${byok.message}`);
      await getSlackClient().chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `❌ ${byok.message}`,
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

    runRAG(question, companyId, limits.maxDocuments, company, { groq: byok.groq, gemini: byok.gemini }).then(async (answer) => {
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
