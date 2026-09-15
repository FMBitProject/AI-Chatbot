import { NextRequest } from "next/server";
import { WebClient } from "@slack/web-api";
import { eq, ne, and } from "drizzle-orm";
import { companies, slackInstallations } from "@/lib/db/schema";
import { withTransaction } from "@/lib/db/transaction";
import { encryptSecret } from "@/lib/secret-box";
import { absoluteUrl } from "@/lib/site-url";
import { toAdminWithSlackStatus, type SlackStatus } from "@/lib/slack";
import {
  readSlackInstallState,
  consumeSlackInstallState,
  SLACK_INSTALL_NONCE_COOKIE,
  SLACK_INSTALL_NONCE_PATH,
} from "@/lib/slack-install-state";
import { requireCompanyAdmin } from "@/lib/auth-guard";
import { resolvePlanById } from "@/lib/subscription";
import { canUseAiAnswers } from "@/lib/pricing";

// Clear the browser cookie on every exit. Replay protection is enforced by
// consuming the server-side nonce before exchanging the OAuth code.
function finish(status: SlackStatus) {
  const res = toAdminWithSlackStatus(status);
  res.cookies.set(SLACK_INSTALL_NONCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: SLACK_INSTALL_NONCE_PATH,
    maxAge: 0,
  });
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
    const decoded = readSlackInstallState(
      stateParam, req.cookies.get(SLACK_INSTALL_NONCE_COOKIE)?.value,
    );
    const guard = await requireCompanyAdmin(req);
    if (!guard.ok || guard.user.companyId !== decoded.companyId || guard.user.id !== decoded.userId) {
      return finish("error");
    }
    const { subscription } = await resolvePlanById(guard.user.companyId);
    if (!canUseAiAnswers(subscription.plan)) return finish("plan");
    if (!(await consumeSlackInstallState(decoded))) return finish("error");
    companyId = guard.user.companyId;
    userId = guard.user.id;
  } catch (error) {
    console.error("[slack/oauth/callback] State validation failed:", error);
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

    // Serialize replacements within a company. The conditional upsert below
    // also prevents two companies racing to claim the same Slack workspace.
    await withTransaction(async (tx) => {
      await tx.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, companyId)).for("update");
      await tx.delete(slackInstallations).where(
        and(eq(slackInstallations.companyId, companyId), ne(slackInstallations.teamId, teamId)),
      );

      const installed = await tx.insert(slackInstallations).values({
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
          teamName: result.team?.name ?? null,
          botToken: encryptedToken,
          botUserId: result.bot_user_id ?? null,
          scopes: result.scope ?? null,
          installedByUserId: userId,
          installedAt: new Date(),
        },
        setWhere: eq(slackInstallations.companyId, companyId),
      }).returning({ teamId: slackInstallations.teamId });
      if (installed.length !== 1) {
        throw new WorkspaceOwnedByAnotherCompanyError("Slack workspace belongs to another company");
      }
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
