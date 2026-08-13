import { NextRequest } from "next/server";
import { WebClient } from "@slack/web-api";
import { eq, ne, and } from "drizzle-orm";
import { slackInstallations } from "@/lib/db/schema";
import { withTransaction } from "@/lib/db/transaction";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { absoluteUrl } from "@/lib/site-url";
import { toAdminWithSlackStatus } from "@/lib/slack";
import { SLACK_INSTALL_STATE_CONTEXT, SLACK_INSTALL_NONCE_COOKIE } from "@/app/api/slack/install/route";

/**
 * Answers the admin's browser and burns the install nonce on the way out.
 *
 * Every exit from this route goes through here, success and failure alike. The
 * nonce has done its job the moment this callback runs, and leaving the cookie
 * in place would keep it valid for the rest of its ten minutes — a second
 * callback could then reuse it, which is the property the cookie exists to
 * remove. Cleared with the same path the install route set it on; a mismatch
 * there would leave the original cookie untouched.
 */
function finish(status: Parameters<typeof toAdminWithSlackStatus>[0]) {
  const res = toAdminWithSlackStatus(status);
  res.cookies.set(SLACK_INSTALL_NONCE_COOKIE, "", { httpOnly: true, path: "/api/slack", maxAge: 0 });
  return res;
}

// Thrown (and only thrown) when the workspace being installed already belongs
// to a *different* company. Distinguished from a generic failure so the outer
// catch can tell the admin why, instead of a bare "something went wrong" that
// invites retrying into the same refusal.
class WorkspaceOwnedByAnotherCompanyError extends Error {}

/**
 * Completes the "Add to Slack" OAuth flow: exchanges the code for a bot token
 * and records the installation.
 *
 * The `state` param, minted by /api/slack/install, is what ties this callback
 * back to a specific company — Slack itself has no notion of "which of our
 * customers is installing", so without it we would have no way to know.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const slackError = req.nextUrl.searchParams.get("error");

  // The admin declined on Slack's consent screen. Not a failure, just a no-op.
  if (slackError) return finish("denied");
  if (!code || !stateParam) return finish("error");

  let companyId: string;
  let userId: string;
  try {
    const decoded = JSON.parse(decryptSecret(stateParam, SLACK_INSTALL_STATE_CONTEXT)) as {
      companyId?: unknown;
      userId?: unknown;
      nonce?: unknown;
      exp?: unknown;
    };
    // Typed before it is compared. `Date.now() > undefined` is false, so a
    // state object without a numeric exp used to skip the expiry check
    // silently — unreachable without BYOK_SECRET_KEY, but the one field here
    // that had no explicit guard.
    if (typeof decoded.exp !== "number" || Date.now() > decoded.exp) throw new Error("state expired");
    if (typeof decoded.companyId !== "string" || !decoded.companyId
      || typeof decoded.userId !== "string" || !decoded.userId
      || typeof decoded.nonce !== "string" || !decoded.nonce) {
      throw new Error("state missing fields");
    }

    // The state proves *a* company started an install; the cookie proves this
    // browser did. Without this, a leaked state value would be enough to finish
    // the flow from somewhere else — see SLACK_INSTALL_NONCE_COOKIE.
    //
    // A plain comparison is sufficient: there is no oracle to time against,
    // because every attempt burns a single-use OAuth code and the nonce carries
    // 256 bits of entropy.
    const cookieNonce = req.cookies.get(SLACK_INSTALL_NONCE_COOKIE)?.value;
    if (!cookieNonce || cookieNonce !== decoded.nonce) throw new Error("state/cookie nonce mismatch");

    companyId = decoded.companyId;
    userId = decoded.userId;
  } catch (err) {
    // Wrong signature, tampered value, expired, or started in another browser —
    // all the same response to the caller: the install did not happen, try
    // again from the dashboard.
    //
    // An install already in flight when this deploys lands here too, because
    // its state predates the nonce field. It costs that admin one retry, which
    // is why the window is ten minutes and not ten hours.
    console.error("[slack/oauth/callback] Invalid or expired state:", err);
    return finish("error");
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[slack/oauth/callback] SLACK_CLIENT_ID/SLACK_CLIENT_SECRET not configured");
    return finish("error");
  }

  try {
    // No token on this client: oauth.v2.access authenticates with the app's own
    // client_id/client_secret, not a bot token (there isn't one yet).
    const result = await new WebClient().oauth.v2.access({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: absoluteUrl("/api/slack/oauth/callback"),
    });

    const botToken = result.access_token;
    const teamId = result.team?.id;
    if (!botToken || !teamId) {
      throw new Error(`Slack OAuth response missing access_token or team.id (ok=${result.ok})`);
    }

    const encryptedToken = encryptSecret(botToken, `${companyId}:slackBotToken`);

    // Three statements, one transaction. Two problems, both about the same
    // pair of unique constraints:
    //
    // 1. A company reinstalling to a *different* workspace must not collide
    //    with the `slack_installations_company_idx` unique index the old row
    //    still holds — handled by deleting any other installation for this
    //    company first, then upserting by team_id.
    // 2. team_id is the primary key, and `onConflictDoUpdate` below would
    //    happily overwrite *any* existing row's companyId on conflict —
    //    including one that belongs to someone else. Without the ownership
    //    check, a different company completing OAuth for a workspace that is
    //    already connected would silently reassign it away from its real
    //    owner, no error, no notice to the company that lost it. The check
    //    has to run inside this same transaction, not before it, or a
    //    concurrent install could still slip past a check-then-act gap.
    await withTransaction(async (tx) => {
      const [existing] = await tx.select({ companyId: slackInstallations.companyId })
        .from(slackInstallations)
        .where(eq(slackInstallations.teamId, teamId))
        .limit(1);

      if (existing && existing.companyId !== companyId) {
        throw new WorkspaceOwnedByAnotherCompanyError(
          `Workspace ${teamId} is already connected to company ${existing.companyId}`,
        );
      }

      await tx.delete(slackInstallations).where(
        and(eq(slackInstallations.companyId, companyId), ne(slackInstallations.teamId, teamId)),
      );

      await tx.insert(slackInstallations).values({
        teamId,
        companyId,
        teamName: result.team?.name ?? null,
        botToken: encryptedToken,
        botUserId: result.bot_user_id ?? null,
        scopes: result.scope ?? null,
        installedByUserId: userId,
      }).onConflictDoUpdate({
        target: slackInstallations.teamId,
        set: {
          companyId,
          teamName: result.team?.name ?? null,
          botToken: encryptedToken,
          botUserId: result.bot_user_id ?? null,
          scopes: result.scope ?? null,
          installedByUserId: userId,
          installedAt: new Date(),
        },
      });
    });
  } catch (err) {
    if (err instanceof WorkspaceOwnedByAnotherCompanyError) {
      console.warn(`[slack/oauth/callback] ${err.message} — refused reassignment to company ${companyId}`);
      return finish("taken");
    }
    console.error(`[slack/oauth/callback] Failed to complete install for company ${companyId}:`, err);
    return finish("error");
  }

  return finish("connected");
}
