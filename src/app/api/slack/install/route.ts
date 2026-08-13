import { NextRequest, NextResponse } from "next/server";
import { requireCompanyAdmin } from "@/lib/auth-guard";
import { resolvePlanById } from "@/lib/subscription";
import { canUseAiAnswers } from "@/lib/pricing";
import { encryptSecret } from "@/lib/secret-box";
import { absoluteUrl } from "@/lib/site-url";
import { toAdminWithSlackStatus } from "@/lib/slack";

// Scopes the bot needs: `commands` + `app_mentions:read` for the two answering
// entry points, `chat:write` to post the answer back, `users:read` +
// `users:read.email` for resolveSlackUser's email match (see @/lib/slack).
const SLACK_SCOPES = "commands,app_mentions:read,chat:write,users:read,users:read.email";

// The AAD for the OAuth state token: distinct from every other encryptSecret
// call in the app (BYOK keys use `<companyId>:<field>`) so a state value could
// never be replayed as a provider key or vice versa, even though both go
// through the same cipher.
// Exported so the callback route decrypts with the exact same AAD — a typo'd
// duplicate string in either file would make every install fail closed with
// "malformed secret", which is safe but would be a confusing bug to chase.
export const SLACK_INSTALL_STATE_CONTEXT = "slack:install";
const STATE_TTL_MS = 10 * 60 * 1000;

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

  // Bound to this admin's company and short-lived, so a copied/leaked install
  // link cannot be replayed later or against a different company than the one
  // whose admin clicked the button.
  const state = encryptSecret(
    JSON.stringify({
      companyId: guard.user.companyId,
      userId: guard.user.id,
      exp: Date.now() + STATE_TTL_MS,
    }),
    SLACK_INSTALL_STATE_CONTEXT,
  );

  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SLACK_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", absoluteUrl("/api/slack/oauth/callback"));
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl.toString());
}
