import { NextRequest } from "next/server";
import { WebClient } from "@slack/web-api";
import { eq, ne, and } from "drizzle-orm";
import { slackInstallations } from "@/lib/db/schema";
import { withTransaction } from "@/lib/db/transaction";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { absoluteUrl } from "@/lib/site-url";
import { toAdminWithSlackStatus } from "@/lib/slack";
import { SLACK_INSTALL_STATE_CONTEXT } from "@/app/api/slack/install/route";

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
  if (slackError) return toAdminWithSlackStatus("denied");
  if (!code || !stateParam) return toAdminWithSlackStatus("error");

  let companyId: string;
  let userId: string;
  try {
    const decoded = JSON.parse(decryptSecret(stateParam, SLACK_INSTALL_STATE_CONTEXT)) as {
      companyId: string;
      userId: string;
      exp: number;
    };
    // TODO(minor): exp isn't checked to actually be a number before this
    // comparison — `Date.now() > undefined` is always false, so a state
    // object missing exp would silently skip expiry. Not reachable today
    // (this app always sets exp, and the ciphertext can't be forged without
    // BYOK_SECRET_KEY), but unlike the presence check on the next line it has
    // no explicit guard.
    if (Date.now() > decoded.exp) throw new Error("state expired");
    if (!decoded.companyId || !decoded.userId) throw new Error("state missing fields");
    companyId = decoded.companyId;
    userId = decoded.userId;
  } catch (err) {
    // Wrong signature, tampered value, or expired — all the same response to
    // the caller: the install did not happen, try again from the dashboard.
    console.error("[slack/oauth/callback] Invalid or expired state:", err);
    return toAdminWithSlackStatus("error");
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[slack/oauth/callback] SLACK_CLIENT_ID/SLACK_CLIENT_SECRET not configured");
    return toAdminWithSlackStatus("error");
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
      return toAdminWithSlackStatus("taken");
    }
    console.error(`[slack/oauth/callback] Failed to complete install for company ${companyId}:`, err);
    return toAdminWithSlackStatus("error");
  }

  return toAdminWithSlackStatus("connected");
}
