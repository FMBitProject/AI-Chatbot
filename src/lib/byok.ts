import { groq, createGroq } from "@ai-sdk/groq";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import type { Company } from "@/lib/subscription";
import { providerSecretContext, type StoredAiSettings } from "./ai-settings";
import type { ProviderKeys } from "./models";

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
export async function geminiKey(company: Company | undefined): Promise<string | null> {
  if (!company) return null;
  const { loadAiSettings } = await import("./ai-settings-store");
  const settings = await loadAiSettings(company.id);
  if (!settings.primary) return null;
  const google = settings.providers.find(p => p.provider === "google");
  if (!google && !settings.legacy) throw new Error("Key Gemini untuk embedding belum terpasang.");
  return google ? decryptSecret(google.encryptedKey, providerSecretContext(company.id, "google")) : null;
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
  | ({ ok: true } & ProviderKeys)
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
export function resolveStoredByok(companyId: string, settings: StoredAiSettings): ProviderKeys {
  const keys: ProviderKeys = { groq: null, gemini: null };
  if (!settings.primary) return keys;
  keys.ownOnly = true;
  keys.chain = [];
  for (const provider of [settings.primary, settings.fallback, "google"] as const) {
    if (!provider) continue;
    const row = settings.providers.find(p => p.provider === provider);
    if (!row) {
      if (provider === "google" && settings.legacy && provider !== settings.primary && provider !== settings.fallback) continue;
      throw new Error("API key provider yang dipilih belum terpasang.");
    }
    keys[provider === "google" ? "gemini" : provider] = decryptSecret(row.encryptedKey, providerSecretContext(companyId, provider));
  }
  for (const provider of [settings.primary, settings.fallback]) {
    if (provider) {
      const row = settings.providers.find(p => p.provider === provider)!;
      keys.chain.push({ provider, id: row.model });
    }
  }
  return keys;
}
/**
 * Whether answering a question costs us nothing — the test that decides
 * whether this company's question caps come off (see getLimits).
 *
 * `ownOnly` alone is NOT that test, and the gap is not hypothetical. It only
 * says the *generation* chain is the customer's. Every question also runs one
 * embedding, and `getEmbedding` falls back to our platform key whenever the
 * customer's Gemini key is null (`apiKey || process.env…`). A legacy workspace
 * that set a Groq key and never a Gemini one lands exactly there: `ownOnly` is
 * true, `gemini` is null, and lifting its caps would hand it unlimited
 * questions that each bill an embedding to our shared free-tier key — the
 * unbounded cost the caps exist to prevent, reintroduced by the very feature
 * meant to retire them, and on the one key every other tenant shares.
 *
 * So both halves have to be the customer's before anything is lifted.
 */
export function billsOwnProvider(keys: ProviderKeys): boolean {
  return !!keys.ownOnly && !!keys.gemini;
}

/**
 * The same question as `billsOwnProvider`, for callers that need the answer
 * without the keys — the dashboard showing which limits apply.
 *
 * A google row present is exactly what makes `resolveStoredByok` set
 * `keys.gemini`, so the two agree by construction. They have to: if this said
 * yes where the answering channels say no, the subscription page would promise
 * a customer unlimited questions that chat then refuses at 2.000.
 *
 * Reads the settings row only and never decrypts, so an unreadable key cannot
 * take the subscription page down with it: a customer whose key is broken still
 * needs to see their plan in order to fix it.
 */
export async function usesOwnKeys(companyId: string): Promise<boolean> {
  // TODO: MINOR — ini menambah satu transaksi WebSocket (withTenant, wajib
  // karena company_ai_settings kena RLS) per muat halaman dasbor admin.
  // Bukan jalur panas, tapi bisa digabung ke query yang sudah ada di endpoint.
  const { loadAiSettings } = await import("./ai-settings-store");
  const settings = await loadAiSettings(companyId);
  return !!settings.primary && settings.providers.some(row => row.provider === "google");
}

export async function resolveByok(company: Company | undefined): Promise<ByokResolution> {
  try {
    if (!company) return { ok: true, groq: null, gemini: null };
    const { loadAiSettings } = await import("./ai-settings-store");
    return { ok: true, ...resolveStoredByok(company.id, await loadAiSettings(company.id)) };
  } catch {
    return { ok: false, message: "Konfigurasi BYOK tidak dapat dibaca. Periksa key dan pengaturan provider di halaman admin." };
  }
}
