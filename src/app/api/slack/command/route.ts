import { NextRequest, NextResponse, after } from "next/server";
import { verifySlackSignature, installationFor, resolveSlackUser, escapeSlackText, readSlackBody } from "@/lib/slack";
import { consumeQuestionQuota, isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { resolveByok } from "@/lib/byok";
import { canUseAiAnswers } from "@/lib/pricing";
import { answerForSlack, formatSlackAnswer } from "@/lib/slack-answer";
import { LIMITS } from "@/lib/validate";

// The deferred work runs inside `after`, which on Vercel extends the
// invocation through waitUntil — bounded by this value rather than by Slack's
// 3s ack window. An embedding call plus a generation that may fall through the
// whole model chain does not reliably fit in the platform default.
export const maxDuration = 60;

/**
 * Posts a delayed message to the command's response_url.
 *
 * Never throws: this runs inside `after`, where an unhandled rejection buys
 * nothing — the person has already been told the question is being worked on,
 * and the only thing left to do about a failed delivery is log it.
 */
async function reply(responseUrl: string, text: string, inChannel = false): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: inChannel ? "in_channel" : "ephemeral", text }),
    });
  } catch (err) {
    console.error("[slack/command] Failed to post to response_url:", err);
  }
}

/**
 * Slash command entry point (`/tanya <pertanyaan>`).
 *
 * Slack gives a slash command 3 seconds to answer the HTTP request or it tells
 * the user "the app did not respond" — and every check this route runs (the
 * installation lookup, the Slack profile match, the plan, the seat, the quota)
 * is a database round trip or an API call. On a cold start those alone
 * overshoot the window, which is exactly what happened: the work was running
 * correctly and the user still saw a failure.
 *
 * So nothing that touches the network happens before the response. The handler
 * validates only what it can decide from the request body itself, acks with
 * the "sedang mencari" message as the response body — no extra round trip to
 * produce it — and hands the rest to `after`, which keeps the invocation alive
 * past the response. Every later message, refusal or answer alike, goes back
 * through response_url, which Slack keeps open for 30 minutes.
 */
export async function POST(req: NextRequest) {
  // Bounded rather than unbounded: this endpoint is public and cannot
  // authenticate anything until it has the whole body. See readSlackBody.
  const rawBody = await readSlackBody(req);
  if (rawBody === null) return new Response("Payload too large", { status: 413 });

  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";

  if (!signingSecret || !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const teamId = params.get("team_id") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const text = params.get("text")?.trim() ?? "";
  const responseUrl = params.get("response_url") ?? "";

  // Decided from the request body alone, so they stay in front of the ack —
  // answering "you typed it wrong" immediately is better than acking and then
  // correcting a moment later.
  if (!text) {
    return NextResponse.json({ response_type: "ephemeral", text: "Gunakan: `/tanya <pertanyaan Anda>`" });
  }

  // Same bound /api/chat and /api/v1/query enforce (see @/lib/validate) — a
  // question past this length is a mistake or abuse either way, and answering
  // the first LIMITS.question characters of it silently would hide which.
  if (text.length > LIMITS.question) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `❌ Pertanyaan terlalu panjang (maksimum ${LIMITS.question} karakter).`,
    });
  }

  after(async () => {
    try {
      const installation = await installationFor(teamId);
      if (!installation.ok) {
        // decrypt_failed already logged loudly inside installationFor — this
        // is an operator problem hitting every connected company at once, not
        // a routine "not linked yet", so it gets a different message rather
        // than being folded into the same reply as not_installed.
        await reply(responseUrl, installation.reason === "decrypt_failed"
          ? "❌ Terjadi gangguan teknis pada integrasi Slack. Tim kami sudah diberi tahu."
          : "❌ Workspace Slack ini belum terhubung ke IntelliBase. Hubungi admin perusahaan.");
        return;
      }
      const { companyId, botToken } = installation;

      // Scoped to this installation's companyId — see resolveSlackUser for why
      // that, not the email alone, is what makes this safe across tenants.
      const userLookup = await resolveSlackUser(companyId, slackUserId, botToken);
      if (!userLookup.ok) {
        // lookup_failed already logged loudly inside resolveSlackUser — a
        // Slack API problem is not the same thing as "you never linked your
        // account", and telling someone who IS linked to go link it again is
        // not a helpful message.
        await reply(responseUrl, userLookup.reason === "lookup_failed"
          ? "❌ Terjadi gangguan teknis saat memeriksa akun Slack Anda. Coba lagi sebentar lagi."
          : "❌ Akun Slack Anda belum terhubung ke IntelliBase. Pastikan email profil Slack Anda sama dengan email akun IntelliBase Anda, lalu hubungi admin jika masih gagal.");
        return;
      }
      const dbUser = userLookup.user;

      // Slack is a full answering channel, so it runs the same plan rules as
      // the chat UI and the public API: effective plan (with grace period),
      // frozen seats, company quota and frozen documents.
      const { company, subscription, limits } = await resolvePlanById(companyId);

      // Same rule as the chat UI. Slack is a full answering channel, so
      // leaving it open would make the gate a suggestion: a Starter workspace
      // would simply ask from Slack instead.
      if (!canUseAiAnswers(subscription.plan)) {
        await reply(responseUrl, "🔒 Jawaban AI tersedia mulai paket berbayar. Paket gratis bisa memakai pencarian dokumen di aplikasi.");
        return;
      }

      if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
        await reply(responseUrl, `❌ ${SEAT_FROZEN_MESSAGE}`);
        return;
      }

      // Before the quota, for the reason spelled out in resolveByok: a key we
      // cannot decrypt is a standing failure, so charging a question for it
      // would drain the whole daily allowance into errors.
      const byok = resolveByok(company);
      if (!byok.ok) {
        console.error(`[slack/command] BYOK key unreadable for company ${companyId}: ${byok.message}`);
        await reply(responseUrl, `❌ ${byok.message}`);
        return;
      }

      const quotaFailure = await consumeQuestionQuota(companyId, limits);
      if (quotaFailure) {
        await reply(responseUrl, quotaFailure.period === "daily"
          ? `❌ Kuota pertanyaan harian perusahaan sudah habis (${quotaFailure.limit}/hari). Coba lagi besok atau upgrade paket.`
          : `❌ Kuota pertanyaan bulanan perusahaan sudah habis (${quotaFailure.limit}/bulan). Upgrade paket untuk menambah kuota.`);
        return;
      }

      const answer = await answerForSlack({
        question: text,
        companyId,
        department: dbUser.department,
        maxDocuments: limits.maxDocuments,
        keys: { groq: byok.groq, gemini: byok.gemini },
        label: "slack/command",
      });

      // The question is escaped here because only this route echoes it; the
      // answer and its source footer are escaped inside formatSlackAnswer,
      // which /api/slack/events shares. Posted in_channel, under this app's
      // name, so every value in it comes from outside — see escapeSlackText.
      await reply(
        responseUrl,
        `*Pertanyaan:* ${escapeSlackText(text)}\n\n*Jawaban:*\n${formatSlackAnswer(answer)}`,
        true,
      );
    } catch (err) {
      console.error("[slack/command] Failed to answer:", err);
      await reply(responseUrl, "❌ Terjadi kesalahan. Silakan coba lagi.");
    }
  });

  return NextResponse.json({ response_type: "ephemeral", text: "⏳ Sedang mencari jawaban..." });
}
