import { NextRequest, NextResponse, after } from "next/server";
import { verifySlackSignature, installationFor, resolveSlackUser, slackClient } from "@/lib/slack";
import { consumeQuestionQuota, isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { resolveByok } from "@/lib/byok";
import { canUseAiAnswers } from "@/lib/pricing";
import { answerForSlack } from "@/lib/slack-answer";
import { LIMITS } from "@/lib/validate";

// Same reasoning as /api/slack/command: the answering work runs inside
// `after`, past the response, and needs more room than the platform default.
export const maxDuration = 60;

/**
 * Events API entry point — answers an `app_mention` in-thread.
 *
 * Slack expects an acknowledgement within 3 seconds and retries the delivery
 * up to three times when it does not get one. That made the old shape
 * doubly wrong: every check (installation, profile match, plan, seat, quota)
 * ran before the ack, so a cold start could blow the window — and each retry
 * would then re-enter the handler, spend another question from the quota and
 * post another answer into the thread.
 *
 * Acking first fixes both. Nothing that touches the network happens before the
 * response now; the work moves into `after`, which keeps the invocation alive
 * once the ack is already on its way back to Slack.
 */
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

  // Answered synchronously, and it has to be: Slack reads the challenge out of
  // this response body when verifying the Request URL.
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === "event_callback" && body.event) {
    const event = body.event;
    if (event.bot_id || event.type !== "app_mention") {
      return NextResponse.json({ ok: true });
    }

    const teamId = body.team_id ?? "";
    const slackUserId = event.user ?? "";
    const channel = event.channel ?? "";
    const threadTs = event.ts;
    const question = (event.text ?? "").replace(/<@[^>]+>/g, "").trim();

    if (!question) return NextResponse.json({ ok: true });

    after(async () => {
      // Resolved before anything can post: every reply below needs a client,
      // and without an installation there is no token to build one from.
      const installation = await installationFor(teamId);
      if (!installation.ok) {
        // Nothing to reply with either way — decrypt_failed is already logged
        // loudly inside installationFor, and not_installed should not be
        // reachable here at all (a workspace that never installed the app
        // cannot trigger app_mention).
        return;
      }
      const { companyId, botToken } = installation;
      const client = slackClient(botToken);

      const say = async (text: string) => {
        try {
          await client.chat.postMessage({ channel, thread_ts: threadTs, text });
        } catch (err) {
          console.error(`[slack/events] Failed to post to channel ${channel}:`, err);
        }
      };

      try {
        // Same bound /api/chat and /api/v1/query enforce (see @/lib/validate).
        if (question.length > LIMITS.question) {
          await say(`❌ Pertanyaan terlalu panjang (maksimum ${LIMITS.question} karakter).`);
          return;
        }

        // Scoped to this installation's companyId — see resolveSlackUser for
        // why that, not the email alone, is what makes this safe across tenants.
        const userLookup = await resolveSlackUser(companyId, slackUserId, botToken);
        if (!userLookup.ok) {
          // lookup_failed already logged loudly inside resolveSlackUser — a
          // Slack API problem is not the same thing as "you never linked your
          // account", and telling someone who IS linked to go link it again is
          // not a helpful message.
          await say(userLookup.reason === "lookup_failed"
            ? "❌ Terjadi gangguan teknis saat memeriksa akun Slack Anda. Coba lagi sebentar lagi."
            : "❌ Akun Slack Anda belum terhubung ke IntelliBase. Pastikan email profil Slack Anda sama dengan email akun IntelliBase Anda, lalu hubungi admin jika masih gagal.");
          return;
        }
        const dbUser = userLookup.user;

        // Same plan rules as the chat UI and the public API (see resolvePlan).
        const { company, subscription, limits } = await resolvePlanById(companyId);

        // Answers are a paid feature; a mention and a slash command must agree
        // about that, or the gate is only as strong as whichever entry point
        // was forgotten.
        if (!canUseAiAnswers(subscription.plan)) {
          await say("🔒 Jawaban AI tersedia mulai paket berbayar. Paket gratis bisa memakai pencarian dokumen di aplikasi.");
          return;
        }

        if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
          await say(`❌ ${SEAT_FROZEN_MESSAGE}`);
          return;
        }

        // Before the quota, for the reason spelled out in resolveByok: a key
        // we cannot decrypt is a standing failure, not a passing one. Charging
        // a question for it would drain the whole daily allowance into errors.
        const byok = resolveByok(company);
        if (!byok.ok) {
          console.error(`[slack/events] BYOK key unreadable for company ${companyId}: ${byok.message}`);
          await say(`❌ ${byok.message}`);
          return;
        }

        const quotaFailure = await consumeQuestionQuota(companyId, limits);
        if (quotaFailure) {
          await say(quotaFailure.period === "daily"
            ? `❌ Kuota pertanyaan harian perusahaan sudah habis (${quotaFailure.limit}/hari). Coba lagi besok atau upgrade paket.`
            : `❌ Kuota pertanyaan bulanan perusahaan sudah habis (${quotaFailure.limit}/bulan). Upgrade paket untuk menambah kuota.`);
          return;
        }

        await say("⏳ Sedang mencari jawaban dari dokumen internal...");

        const { text: answer, sources } = await answerForSlack({
          question,
          companyId,
          department: dbUser.department,
          maxDocuments: limits.maxDocuments,
          keys: { groq: byok.groq, gemini: byok.gemini },
          label: "slack/events",
        });

        const footer = sources.length > 0 ? `\n\n_Sumber: ${sources.join(", ")}_` : "";
        await say(`${answer}${footer}`);
      } catch (err) {
        console.error(`[slack/events] Failed to answer company ${companyId}:`, err);
        await say("❌ Terjadi kesalahan. Silakan coba lagi.");
      }
    });
  }

  return NextResponse.json({ ok: true });
}
