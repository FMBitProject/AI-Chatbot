import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature, installationFor, resolveSlackUser } from "@/lib/slack";
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
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const teamId = params.get("team_id") ?? "";
  const slackUserId = params.get("user_id") ?? "";
  const text = params.get("text")?.trim() ?? "";
  const responseUrl = params.get("response_url") ?? "";

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

  const installation = await installationFor(teamId);
  if (!installation.ok) {
    // decrypt_failed already logged loudly inside installationFor — this is
    // an operator problem hitting every connected company at once, not a
    // routine "not linked yet", so it gets a different message rather than
    // being folded into the same reply as not_installed.
    return NextResponse.json({
      response_type: "ephemeral",
      text: installation.reason === "decrypt_failed"
        ? "❌ Terjadi gangguan teknis pada integrasi Slack. Tim kami sudah diberi tahu."
        : "❌ Workspace Slack ini belum terhubung ke IntelliBase. Hubungi admin perusahaan.",
    });
  }
  const { companyId, botToken } = installation;

  // Scoped to this installation's companyId — see resolveSlackUser for why
  // that, not the email alone, is what makes this safe across tenants.
  const userLookup = await resolveSlackUser(companyId, slackUserId, botToken);
  if (!userLookup.ok) {
    // lookup_failed already logged loudly inside resolveSlackUser — a Slack
    // API problem is not the same thing as "you never linked your account",
    // and telling someone who IS linked to go link it again is not a helpful
    // message.
    return NextResponse.json({
      response_type: "ephemeral",
      text: userLookup.reason === "lookup_failed"
        ? "❌ Terjadi gangguan teknis saat memeriksa akun Slack Anda. Coba lagi sebentar lagi."
        : "❌ Akun Slack Anda belum terhubung ke IntelliBase. Pastikan email profil Slack Anda sama dengan email akun IntelliBase Anda, lalu hubungi admin jika masih gagal.",
    });
  }
  const dbUser = userLookup.user;

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
  // whole daily allowance into errors.
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
    const { text: answer, sources } = await answerForSlack({
      question: text,
      companyId,
      department: dbUser.department,
      maxDocuments: limits.maxDocuments,
      keys: { groq: byok.groq, gemini: byok.gemini },
      label: "slack/command",
    });

    const footer = sources.length > 0 ? `\n\n_Sumber: ${sources.join(", ")}_` : "";

    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        text: `*Pertanyaan:* ${text}\n\n*Jawaban:*\n${answer}${footer}`,
      }),
    });
  })().catch(async (err) => {
    console.error(`[slack/command] Failed to answer company ${companyId}:`, err);
    // Nested try/catch rather than a bare await: this is already the last
    // link in the chain, so a rejection here (an expired response_url, a
    // network blip) would otherwise be an unhandled promise rejection instead
    // of just a question that quietly never got its error message.
    try {
      await fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_type: "ephemeral", text: "❌ Terjadi kesalahan. Silakan coba lagi." }),
      });
    } catch (notifyErr) {
      console.error(`[slack/command] Also failed to notify Slack of the failure for company ${companyId}:`, notifyErr);
    }
  });

  return new Response(null, { status: 200 });
}
