import { WebClient } from "@slack/web-api";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { slackInstallations, users } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/secret-box";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Redirects to /admin with `?slack=<status>` so SlackTab can show a toast.
 *
 * Shared by /api/slack/install and /api/slack/oauth/callback specifically so
 * neither one is tempted to answer a browser-navigated GET with a bare JSON
 * error body instead — that was install's own bug before this existed: every
 * one of its failure paths returned `NextResponse.json(...)`, which a real
 * browser renders as a page of literal `{"error":"..."}` text since the route
 * is only ever reached via `<a href>`, never `fetch()`. Living here rather
 * than in either route file avoids a circular import between the two (the
 * callback route already imports install's SLACK_INSTALL_STATE_CONTEXT).
 */
export function toAdminWithSlackStatus(status: "connected" | "denied" | "error" | "taken" | "plan") {
  const url = new URL(absoluteUrl("/admin"));
  url.searchParams.set("slack", status);
  return NextResponse.redirect(url);
}

/**
 * Escapes text before it is interpolated into a message this app posts.
 *
 * Slack renders a message's `text` as mrkdwn, which makes these three
 * characters markup rather than content: `<https://evil.example|Klik di sini>`
 * becomes a labelled hyperlink, `<!channel>` a broadcast. Every message this
 * app sends carries its own name and icon, and a slash command's answer is
 * posted `in_channel` — so echoing a question unescaped let any member publish
 * a link that appears to come from the company's own document assistant. That
 * is the shape internal phishing takes, and it is a privilege the member does
 * not otherwise have: they can post a link themselves, but not one attributed
 * to the system.
 *
 * Exactly the three characters Slack documents, ampersand first so the escapes
 * it introduces are not escaped again. Applied only to values that come from
 * outside — the question, the generated answer, and document names (an admin
 * can upload a file called `<!channel>.pdf`). The markup this app writes
 * itself, `*Pertanyaan:*` and `_Sumber:_`, stays outside these calls or it
 * would render as literal asterisks.
 */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// How far out of date a signed request may be. Slack's own recommendation.
const MAX_SIGNATURE_AGE_SECONDS = 60 * 5;

/**
 * The largest request body either Slack webhook will read.
 *
 * Both entry points are public — they authenticate with an HMAC over the whole
 * body, which means an unauthenticated caller can make us buffer and hash
 * whatever it sends before we get to say no. Vercel's 4.5 MB request cap is the
 * only bound today; this makes the first no much cheaper.
 *
 * Generous on purpose. A slash command's payload is a few hundred bytes and
 * Slack caps the command text at 4,000 characters; the fattest realistic event
 * is an `app_mention` carrying a 40,000-character message, which is still well
 * under 100 KB once JSON-encoded. 256 KB leaves several times that in headroom,
 * so no genuine Slack request can trip it — this is a floor on abuse, not a
 * limit anyone should ever notice.
 */
export const MAX_SLACK_BODY_BYTES = 256 * 1024;

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // The timestamp is part of the signed base string below, so it cannot be
  // moved without breaking the HMAC — this bound is what stops a captured,
  // still-valid request from being replayed indefinitely.
  //
  // Parsed with Number and bounded in both directions. `parseInt` was used
  // here before and yields NaN for a missing or non-numeric header, and every
  // comparison against NaN is false — so the guard passed anything unparseable
  // straight through instead of rejecting it. Nothing could be forged that way,
  // since the signature still had to verify, but a check that never fires reads
  // like protection while providing none. The upper bound is new: a timestamp
  // far in the future used to be accepted.
  const ts = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computedSig = `v0=${hmac}`;

  try {
    return timingSafeEqual(Buffer.from(computedSig), Buffer.from(signature));
  } catch {
    return false;
  }
}

export type SlackInstallationLookup =
  | { ok: true; companyId: string; botToken: string }
  | { ok: false; reason: "not_installed" }
  // A row exists but its bot token would not decrypt: BYOK_SECRET_KEY is
  // missing, wrong, or was rotated without a backfill. Kept distinct from
  // "not_installed" so callers do not report a routine "belum terhubung" for
  // what is actually an operator-caused outage hitting every connected
  // company at once — the same distinction @/lib/byok's resolveByok makes for
  // provider keys, and for the same reason.
  | { ok: false; reason: "decrypt_failed" };

/**
 * The company + bot token installed for a Slack workspace.
 *
 * Every answering route starts here rather than reading `SLACK_BOT_TOKEN`: one
 * app now serves every customer's workspace, so `team_id` — not an env var —
 * is what tells us which company is asking and which token to answer with.
 */
export async function installationFor(teamId: string): Promise<SlackInstallationLookup> {
  const [row] = await db.select().from(slackInstallations)
    .where(eq(slackInstallations.teamId, teamId)).limit(1);
  if (!row) return { ok: false, reason: "not_installed" };

  try {
    return { ok: true, companyId: row.companyId, botToken: decryptSecret(row.botToken, `${row.companyId}:slackBotToken`) };
  } catch (error) {
    console.error(`[slack] Failed to decrypt bot token for team ${teamId} (company ${row.companyId}):`, error);
    return { ok: false, reason: "decrypt_failed" };
  }
}

/** A client scoped to one company's bot token. Cheap to construct — no state worth memoizing. */
export function slackClient(botToken: string): WebClient {
  return new WebClient(botToken);
}

export type SlackUser = typeof users.$inferSelect;

export type SlackUserLookup =
  | { ok: true; user: SlackUser }
  // The API call — or a match against this company's employees — completed
  // normally and found nothing: a genuinely unlinked Slack member, or their
  // profile email doesn't match anyone here. Nothing an operator can fix.
  | { ok: false; reason: "not_linked" }
  // users.info itself failed (bot token revoked, Slack outage, rate limited)
  // for someone who may well be linked. Kept distinct from "not_linked" for
  // the same reason installationFor separates decrypt_failed: collapsing an
  // operator/outage problem into "you're not linked" tells a genuinely linked
  // employee to go do something that was never broken.
  | { ok: false; reason: "lookup_failed" };

/**
 * The IntelliBase employee behind a Slack member id, scoped to `companyId`.
 *
 * The `companyId` filter is not defence-in-depth here, it is the whole
 * defence: a Slack profile email is set by whoever owns that Slack account, not
 * verified by us, so matching on email alone would let anyone who can install
 * this app into *their own* workspace set their profile email to a real
 * customer's employee address and be treated as that employee. Filtering by
 * `companyId` — which comes from `installationFor`, itself keyed by which
 * workspace OAuth'd in, never from anything the caller supplies — is what
 * makes that impossible: an attacker's own workspace can only ever resolve
 * against their own company's employees.
 *
 * `users.slack_user_id` is a cache of a previous resolution. On a miss, this
 * calls Slack's `users.info` for the profile email, matches it against this
 * company's employees, and writes the id back so the next question for the
 * same person skips the Slack API round trip.
 */
export async function resolveSlackUser(
  companyId: string,
  slackUserId: string,
  botToken: string,
): Promise<SlackUserLookup> {
  const [cached] = await db.select().from(users)
    .where(and(eq(users.companyId, companyId), eq(users.slackUserId, slackUserId))).limit(1);
  if (cached) return { ok: true, user: cached };

  let profile;
  try {
    profile = await slackClient(botToken).users.info({ user: slackUserId });
  } catch (error) {
    console.error(`[slack] users.info failed for ${slackUserId}:`, error);
    return { ok: false, reason: "lookup_failed" };
  }

  const email = profile.user?.profile?.email?.toLowerCase().trim();
  if (!email) return { ok: false, reason: "not_linked" };

  const [match] = await db.select().from(users)
    .where(and(eq(users.companyId, companyId), eq(users.email, email))).limit(1);
  if (!match) return { ok: false, reason: "not_linked" };

  // Best-effort: a failed cache write means the next question pays for another
  // users.info call, not a broken link, so it is not worth failing the answer
  // that is already in progress over it.
  await db.update(users).set({ slackUserId }).where(eq(users.id, match.id))
    .catch((error) => console.error(`[slack] Failed to cache slack_user_id for user ${match.id}:`, error));

  return { ok: true, user: { ...match, slackUserId } };
}
