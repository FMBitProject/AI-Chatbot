import { groq, createGroq } from "@ai-sdk/groq";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import type { Company } from "@/lib/subscription";

/**
 * Bring-your-own-key: the customer's own Groq / Gemini credentials.
 *
 * Every read of `companies.groq_api_key` or `companies.gemini_api_key` goes
 * through this module, and that is the point of it existing rather than each
 * caller unwrapping the column itself. The columns hold ciphertext now, and the
 * five call sites that need the plaintext — chat, search, the public API, both
 * Slack routes and the indexer — are exactly the places where "forgot to
 * decrypt" would not fail loudly. It would send the literal string "v1:AAAA…" to
 * Groq as a bearer token, get a 401 back, and surface to the customer as their
 * key being rejected. Centralising the unwrap makes that mistake unavailable.
 */

export type ByokField = "groqApiKey" | "geminiApiKey";

/**
 * The AAD bound into every stored key: which company, which column.
 *
 * Both halves are load-bearing. Without the company id, a ciphertext lifted from
 * one row decrypts perfectly in another — so anyone who can write to `companies`
 * could point a rival's row at a key they control. Without the field name, the
 * Gemini key decrypts happily out of the Groq column, which is far more likely to
 * happen by accident in a migration than on purpose.
 */
function context(companyId: string, field: ByokField): string {
  return `${companyId}:${field}`;
}

/** Encrypt a provider key for storage against a specific company + column. */
export function encryptProviderKey(plaintext: string, companyId: string, field: ByokField): string {
  return encryptSecret(plaintext, context(companyId, field));
}

/**
 * The company's own key for `field`, or null when they have not set one.
 *
 * Throws when a key is present but cannot be decrypted, and that choice is
 * deliberate — the tempting alternative is to catch the error and fall back to
 * the platform key so that chat keeps working. That fallback would be the worst
 * possible failure for this particular feature: a customer who configured BYOK
 * did so to keep their documents out of our shared, free-tier provider account,
 * and silently routing them back into it is the exact outcome they paid to avoid.
 * It would also be invisible, because everything would appear to work.
 *
 * A decrypt failure means BYOK_SECRET_KEY is missing, wrong, or was rotated
 * without a backfill — an operator problem that hits every BYOK customer at once
 * and needs to be noticed in minutes, not discovered in an audit. So it fails
 * where it happens, loudly.
 */
export function providerKey(company: Company | undefined, field: ByokField): string | null {
  const stored = company?.[field];
  if (!stored) return null;
  try {
    return decryptSecret(stored, context(company.id, field));
  } catch (error) {
    console.error(`[byok] Failed to decrypt ${field} for company ${company.id}:`, error);
    throw new Error(
      `Kunci API ${field === "groqApiKey" ? "Groq" : "Gemini"} tersimpan tidak dapat dibaca. ` +
        "Hubungi dukungan — kunci perlu dipasang ulang.",
    );
  }
}

/** Shorthand for the embedding path, which only ever wants the Gemini key. */
export function geminiKey(company: Company | undefined): string | null {
  return providerKey(company, "geminiApiKey");
}

/**
 * The Groq client to generate with: the company's own account when they have a
 * key, the platform account otherwise.
 *
 * This replaces the `company?.groqApiKey ? createGroq({ … }) : groq` line that
 * had been copied into five files. Same behaviour, one place to be wrong.
 */
export function groqClientFor(company: Company | undefined) {
  return groqClientForKey(providerKey(company, "groqApiKey"));
}

/** Same, for callers that already resolved the key through `resolveByok`. */
export function groqClientForKey(key: string | null) {
  return key ? createGroq({ apiKey: key }) : groq;
}

export type ByokResolution =
  | { ok: true; gemini: string | null; groq: string | null }
  | { ok: false; message: string };

/**
 * Both keys at once, as a value rather than a throw.
 *
 * The throwing helpers above are right for callers that sit inside an error
 * boundary already — the indexer, the Slack routes. They are wrong for the
 * request paths, and for one specific reason: `consumeQuestionQuota` runs before
 * the first key is needed, so a throw after it means the customer is billed a
 * question for a request that then 500s. A decrypt failure is not transient the
 * way a provider 429 is — it persists until an operator fixes the environment —
 * so the same customer would lose their whole daily allowance to failed requests.
 *
 * Resolving both keys up front, before the quota is touched, is what makes that
 * impossible. It also stops the failure being mislabelled: unwrapping the Gemini
 * key inside the embedding try meant an unreadable key was reported to the admin
 * as `AI_ERROR provider: gemini`, sending them to check Google's status page for
 * a problem that is entirely ours.
 */
export function resolveByok(company: Company | undefined): ByokResolution {
  try {
    return { ok: true, gemini: providerKey(company, "geminiApiKey"), groq: providerKey(company, "groqApiKey") };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
