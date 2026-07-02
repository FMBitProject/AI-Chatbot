import { createHash, randomUUID } from "crypto";

const PREFIX_LENGTH = 12;

/** SHA-256 hex digest of a full API key — what we persist and look up by. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Mint a new API key. The plaintext `key` is returned to the caller exactly
 * once (shown to the admin at creation); only `hash` and `prefix` are stored.
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `ib_${randomUUID().replace(/-/g, "")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, PREFIX_LENGTH) };
}
