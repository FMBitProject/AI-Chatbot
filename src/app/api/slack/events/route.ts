import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature, installationFor, resolveSlackUser, slackClient } from "@/lib/slack";
import { consumeQuestionQuota, isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { resolveByok } from "@/lib/byok";
import { canUseAiAnswers } from "@/lib/pricing";
import { answerForSlack } from "@/lib/slack-answer";
import { LIMITS } from "@/lib/validate";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";

  if (!signingSecret || !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // TODO(minor): no try/catch around this parse — a malformed-but-
  // signature-valid body would throw an uncaught exception instead of a
  // clean response. In practice unreachable from genuine Slack traffic (a
  // body that passes HMAC verification is by construction something Slack
  // sent, and Slack always sends valid JSON here), but there's no defensive
  // guard if that assumption is ever wrong.
  const body = JSON.parse(rawBody) as {
    type: string;
    challenge?: string;
    team_id?: string;
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
    // TODO(minor): no idempotency check on event.ts — a genuine Slack retry
    // (transient 5xx, deploy blip) re-runs this whole handler, consuming
    // another quota question and posting a duplicate answer in the thread.
    // Lower risk than it looks since the response is returned well before
    // the RAG work is awaited, which avoids the most common retry trigger
    // (a slow response past Slack's ~3s ack window). Same gap exists in
    // /api/slack/command for repeated response_url posts.

    const teamId = body.team_id ?? "";
    const slackUserId = event.user ?? "";
    const channel = event.channel ?? "";
    const question = (event.text ?? "").replace(/<@[^>]+>/g, "").trim();

    if (!question) return NextResponse.json({ ok: true });

    const installation = await installationFor(teamId);
    if (!installation.ok) {
      // Either way there is no usable bot token to post a reply with — a
      // decrypt_failed is already logged loudly inside installationFor, which
      // is the operator-facing signal for that case; not_installed should not
      // be reachable here anyway (a workspace that never installed the app
      // should not be able to trigger app_mention in the first place). Ack
      // and stop either way.
      return NextResponse.json({ ok: true });
    }
    const { companyId, botToken } = installation;
    const client = slackClient(botToken);

    // Same bound /api/chat and /api/v1/query enforce (see @/lib/validate).
    // Checked here, after the client is available but before the more
    // expensive resolveSlackUser/plan lookups, so an oversized mention is
    // rejected cheaply and the asker still gets a reply either way.
    if (question.length > LIMITS.question) {
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `❌ Pertanyaan terlalu panjang (maksimum ${LIMITS.question} karakter).`,
      });
      return NextResponse.json({ ok: true });
    }

    // Scoped to this installation's companyId — see resolveSlackUser for why
    // that, not the email alone, is what makes this safe across tenants.
    const userLookup = await resolveSlackUser(companyId, slackUserId, botToken);
    if (!userLookup.ok) {
      // lookup_failed already logged loudly inside resolveSlackUser — a Slack
      // API problem is not the same thing as "you never linked your
      // account", and telling someone who IS linked to go link it again is
      // not a helpful message.
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: userLookup.reason === "lookup_failed"
          ? "❌ Terjadi gangguan teknis saat memeriksa akun Slack Anda. Coba lagi sebentar lagi."
          : "❌ Akun Slack Anda belum terhubung ke IntelliBase. Pastikan email profil Slack Anda sama dengan email akun IntelliBase Anda, lalu hubungi admin jika masih gagal.",
      });
      return NextResponse.json({ ok: true });
    }
    const dbUser = userLookup.user;

    // Same plan rules as the chat UI and the public API (see resolvePlan).
    const { company, subscription, limits } = await resolvePlanById(companyId);

    // Answers are a paid feature; a mention and a slash command must agree about
    // that, or the gate is only as strong as whichever entry point was forgotten.
    if (!canUseAiAnswers(subscription.plan)) {
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: "🔒 Jawaban AI tersedia mulai paket berbayar. Paket gratis bisa memakai pencarian dokumen di aplikasi.",
      });
      return NextResponse.json({ ok: true });
    }

    if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `❌ ${SEAT_FROZEN_MESSAGE}`,
      });
      return NextResponse.json({ ok: true });
    }

    // Before the quota, for the reason spelled out in resolveByok: a key we
    // cannot decrypt is a standing failure, not a passing one. Charging a
    // question for it would drain the whole daily allowance into errors.
    const byok = resolveByok(company);
    if (!byok.ok) {
      console.error(`[slack/events] BYOK key unreadable for company ${companyId}: ${byok.message}`);
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `❌ ${byok.message}`,
      });
      return NextResponse.json({ ok: true });
    }

    const quotaFailure = await consumeQuestionQuota(companyId, limits);
    if (quotaFailure) {
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: quotaFailure.period === "daily"
          ? `❌ Kuota pertanyaan harian perusahaan sudah habis (${quotaFailure.limit}/hari). Coba lagi besok atau upgrade paket.`
          : `❌ Kuota pertanyaan bulanan perusahaan sudah habis (${quotaFailure.limit}/bulan). Upgrade paket untuk menambah kuota.`,
      });
      return NextResponse.json({ ok: true });
    }

    client.chat.postMessage({
      channel,
      thread_ts: event.ts,
      text: "⏳ Sedang mencari jawaban dari dokumen internal...",
    }).catch(() => {});

    answerForSlack({
      question,
      companyId,
      department: dbUser.department,
      maxDocuments: limits.maxDocuments,
      keys: { groq: byok.groq, gemini: byok.gemini },
      label: "slack/events",
    }).then(async ({ text: answer, sources }) => {
      const footer = sources.length > 0 ? `\n\n_Sumber: ${sources.join(", ")}_` : "";
      await client.chat.postMessage({
        channel,
        thread_ts: event.ts,
        text: `${answer}${footer}`,
      });
    }).catch(async (err) => {
      console.error(`[slack/events] Failed to answer company ${companyId}:`, err);
      // Nested try/catch rather than a bare await: this is already the last
      // link in the chain, so a rejection here (bot removed from the
      // channel, network blip) would otherwise be an unhandled promise
      // rejection instead of just a mention that quietly never got its error
      // message.
      try {
        await client.chat.postMessage({
          channel,
          thread_ts: event.ts,
          text: "❌ Terjadi kesalahan. Silakan coba lagi.",
        });
      } catch (notifyErr) {
        console.error(`[slack/events] Also failed to notify the channel for company ${companyId}:`, notifyErr);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
