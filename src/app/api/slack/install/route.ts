import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAdmin } from "@/lib/auth-guard";
import { resolvePlanById } from "@/lib/subscription";
import { canUseAiAnswers } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site-url";
import { toAdminWithSlackStatus } from "@/lib/slack";
import {
  issueSlackInstallState,
  SLACK_INSTALL_NONCE_COOKIE,
  SLACK_INSTALL_NONCE_PATH,
  SLACK_INSTALL_STATE_TTL_MS,
} from "@/lib/slack-install-state";

// Scopes the bot needs: `commands` + `app_mentions:read` for the two answering
// entry points, `chat:write` to post the answer back, `users:read` +
// `users:read.email` for resolveSlackUser's email match (see @/lib/slack).
const SLACK_SCOPES = "commands,app_mentions:read,chat:write,users:read,users:read.email";

/**
 * Starts the "Add to Slack" OAuth flow for the caller's company.
 *
 * Gated the same way the answering channels are gated (`canUseAiAnswers`):
 * Slack is sold as a Professional/Enterprise feature, so a Starter admin who
 * finds this URL should see the same upgrade message they would from the
 * Slack bot itself, not a bare redirect to Slack's consent screen.
 *
 * Every failure here redirects back to /admin via toAdminWithSlackStatus
 * rather than returning NextResponse.json — this route is only ever reached
 * by a real browser navigating an `<a href>` from SlackTab, never by fetch(),
 * so a JSON body would render as literal `{"error":"..."}` text on screen
 * instead of landing the admin back on a page that explains what happened.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCompanyAdmin(req);
  if (!guard.ok) return toAdminWithSlackStatus("error");

  const { subscription } = await resolvePlanById(guard.user.companyId);
  if (!canUseAiAnswers(subscription.plan)) {
    return toAdminWithSlackStatus("plan");
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    console.error("[slack/install] SLACK_CLIENT_ID is not configured");
    return toAdminWithSlackStatus("error");
  }

  let state: string;
  let nonce: string;
  try {
    ({ state, nonce } = await issueSlackInstallState(guard.user));
  } catch (error) {
    console.error("[slack/install] Could not issue OAuth state:", error);
    return toAdminWithSlackStatus("error");
  }

  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SLACK_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", absoluteUrl("/api/slack/oauth/callback"));
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set(SLACK_INSTALL_NONCE_COOKIE, nonce, {
    httpOnly: true,
    // Not in development, where the dashboard is served over plain http and a
    // Secure cookie would simply never be stored — turning every local install
    // into a nonce mismatch.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SLACK_INSTALL_NONCE_PATH,
    maxAge: SLACK_INSTALL_STATE_TTL_MS / 1000,
  });
  return res;
}
