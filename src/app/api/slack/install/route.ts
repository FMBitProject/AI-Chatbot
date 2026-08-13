import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
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
 * Cookie holding the nonce that also lives inside the encrypted `state`.
 *
 * The state token cannot be forged — it is AES-256-GCM ciphertext — but on its
 * own it is a bearer token: it says which company is installing and nothing
 * about *who* is holding it. Anyone who obtained a live state value (it travels
 * to slack.com as a query parameter, so it lands in the admin's browser
 * history) could finish the flow from their own browser with their own
 * workspace inside the 10-minute window. They could not then ask questions —
 * `resolveSlackUser` would find no employee of the victim company matching
 * their Slack profile email — but the upsert in the callback deletes any other
 * installation row for that company, which would disconnect the victim's real
 * workspace.
 *
 * Pairing the state with an httpOnly cookie fixes that: completing the flow now
 * requires the browser that started it, not merely the string it was handed.
 * `SameSite=Lax` is deliberate and required — the callback arrives as a
 * top-level GET navigation from slack.com, which Lax allows and Strict would
 * not. Scoped to /api/slack so it is never sent anywhere else.
 *
 * Exported for the callback route, which reads it back. Same reasoning as
 * SLACK_INSTALL_STATE_CONTEXT above: one definition, so a typo cannot make
 * every install fail in a way that looks like a Slack problem.
 */
export const SLACK_INSTALL_NONCE_COOKIE = "slack_install_nonce";

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

  // 256 bits from the CSPRNG: this is the only thing tying the flow to this
  // browser, so it has to be unguessable rather than merely unique.
  const nonce = randomBytes(32).toString("base64url");

  // Bound to this admin's company and short-lived, so a copied/leaked install
  // link cannot be replayed later or against a different company than the one
  // whose admin clicked the button. Also bound to the cookie set below, so a
  // leaked state alone is not enough to finish the flow.
  const state = encryptSecret(
    JSON.stringify({
      companyId: guard.user.companyId,
      userId: guard.user.id,
      nonce,
      exp: Date.now() + STATE_TTL_MS,
    }),
    SLACK_INSTALL_STATE_CONTEXT,
  );

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
    path: "/api/slack",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}
