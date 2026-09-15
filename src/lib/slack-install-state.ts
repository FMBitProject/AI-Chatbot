import { randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifications } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/secret-box";

export const SLACK_INSTALL_STATE_CONTEXT = "slack:install";
export const SLACK_INSTALL_NONCE_COOKIE = "slack_install_nonce";
export const SLACK_INSTALL_NONCE_PATH = "/api/slack/oauth";
export const SLACK_INSTALL_STATE_TTL_MS = 10 * 60 * 1000;
const IDENTIFIER = "slack-install";

export interface SlackInstallState {
  companyId: string;
  userId: string;
  nonce: string;
  exp: number;
}

function identity(state: Pick<SlackInstallState, "companyId" | "userId">) {
  return JSON.stringify({ companyId: state.companyId, userId: state.userId });
}

export async function issueSlackInstallState(user: { companyId: string; id: string }) {
  const now = new Date();
  const payload: SlackInstallState = {
    companyId: user.companyId,
    userId: user.id,
    nonce: randomBytes(32).toString("base64url"),
    exp: now.getTime() + SLACK_INSTALL_STATE_TTL_MS,
  };
  const state = encryptSecret(JSON.stringify(payload), SLACK_INSTALL_STATE_CONTEXT);
  // Existing expiring-record storage: no schema migration is needed.
  await db.delete(verifications).where(and(
    eq(verifications.identifier, IDENTIFIER), lte(verifications.expiresAt, now),
  ));
  await db.insert(verifications).values({
    id: `${IDENTIFIER}:${payload.nonce}`,
    identifier: IDENTIFIER,
    value: identity(payload),
    expiresAt: new Date(payload.exp),
    createdAt: now,
    updatedAt: now,
  });
  return { state, nonce: payload.nonce };
}

export function readSlackInstallState(state: string, cookieNonce: string | undefined): SlackInstallState {
  // Legacy plaintext is accepted for stored BYOK keys, never for public state.
  if (state.length > 4096 || !isEncrypted(state)) throw new Error("Invalid state envelope");
  const parsed: unknown = JSON.parse(decryptSecret(state, SLACK_INSTALL_STATE_CONTEXT));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid state payload");
  const value = parsed as Record<string, unknown>;
  if (typeof value.companyId !== "string" || !value.companyId || value.companyId.length > 256 ||
      typeof value.userId !== "string" || !value.userId || value.userId.length > 256 ||
      typeof value.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce) ||
      typeof value.exp !== "number" || !Number.isSafeInteger(value.exp) || value.exp <= Date.now()) {
    throw new Error("Invalid or expired state payload");
  }
  if (!cookieNonce || cookieNonce.length !== 43 ||
      !timingSafeEqual(Buffer.from(value.nonce), Buffer.from(cookieNonce, "utf8"))) {
    throw new Error("State/cookie nonce mismatch");
  }
  return { companyId: value.companyId, userId: value.userId, nonce: value.nonce, exp: value.exp };
}

export async function consumeSlackInstallState(state: SlackInstallState): Promise<boolean> {
  // DELETE ... RETURNING is atomic across instances. Clearing the browser's
  // cookie alone would not prevent concurrent callbacks or copied-cookie replay.
  const consumed = await db.delete(verifications).where(and(
    eq(verifications.id, `${IDENTIFIER}:${state.nonce}`),
    eq(verifications.identifier, IDENTIFIER),
    eq(verifications.value, identity(state)),
    gt(verifications.expiresAt, new Date()),
  )).returning({ id: verifications.id });
  return consumed.length === 1;
}
