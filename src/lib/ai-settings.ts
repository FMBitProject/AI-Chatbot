import { AI_PROVIDERS, PROVIDER_CATALOG, isAiProvider, isProviderModel, type AiProvider, type AiSettingsView } from "./ai-providers";
import { encryptSecret } from "./secret-box";
import { ValidationError } from "./errors";
import { LIMITS } from "./validate";
import { createHash } from "node:crypto";

function invalidSettings(message: string): ValidationError {
  // These fixed messages contain no keys and tell the admin what to correct.
  return new ValidationError(message, { userMessage: message });
}

export interface StoredProvider {
  provider: AiProvider;
  model: string;
  encryptedKey: string;
  lastTestedAt: Date | null;
}
export interface StoredAiSettings {
  primary: AiProvider | null;
  fallback: AiProvider | null;
  legacy: boolean;
  providers: StoredProvider[];
}
// Preserve the original AAD for legacy credentials copied without decryption.
export function providerSecretContext(companyId: string, provider: AiProvider): string {
  return `${companyId}:${provider === "groq" ? "groqApiKey" : provider === "google" ? "geminiApiKey" : `ai-provider:${provider}`}`;
}
export function settingsView(settings: StoredAiSettings): AiSettingsView {
  return {
    revision: settingsRevision(settings),
    mode: settings.primary ? "byok" : "platform", primary: settings.primary,
    fallback: settings.fallback, legacy: settings.legacy,
    providers: AI_PROVIDERS.map(provider => {
      const row = settings.providers.find(p => p.provider === provider);
      return { provider, model: row?.model ?? PROVIDER_CATALOG[provider].models[0], hasKey: !!row,
        lastTestedAt: row?.lastTestedAt?.toISOString() ?? null };
    }),
  };
}
export function settingsRevision(settings: StoredAiSettings): string {
  // Test timestamps do not change routing. No plaintext key is exposed.
  return createHash("sha256").update(JSON.stringify({ primary: settings.primary,
    fallback: settings.fallback, legacy: settings.legacy,
    providers: [...settings.providers].sort((a, b) => a.provider.localeCompare(b.provider))
      .map(p => [p.provider, p.model, p.encryptedKey]),
  })).digest("hex");
}
export type SettingsInput = {
  primary: AiProvider | null;
  fallback: AiProvider | null;
  providers: { provider: AiProvider; model: string; apiKey?: string | null }[];
};
export function parseSettingsInput(body: Record<string, unknown>): SettingsInput {
  if (Object.keys(body).some(k => !["primary", "fallback", "providers"].includes(k)) ||
      (body.primary !== null && !isAiProvider(body.primary)) ||
      (body.fallback !== null && !isAiProvider(body.fallback)) ||
      !Array.isArray(body.providers) || body.providers.length > AI_PROVIDERS.length) {
    throw invalidSettings("Konfigurasi provider tidak valid.");
  }
  if ((!body.primary && body.fallback) || (body.primary && body.primary === body.fallback)) {
    throw invalidSettings("Provider cadangan harus berbeda dari provider utama.");
  }
  const seen = new Set<string>();
  const providers = body.providers.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidSettings("Provider tidak valid.");
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(k => !["provider", "model", "apiKey"].includes(k)) ||
        !isAiProvider(row.provider) || !isProviderModel(row.provider, row.model) || seen.has(row.provider)) {
      throw invalidSettings("Provider atau model tidak didukung.");
    }
    seen.add(row.provider);
    let apiKey: string | null | undefined;
    if (row.apiKey === null) apiKey = null;
    else if (row.apiKey !== undefined) {
      if (typeof row.apiKey !== "string" || row.apiKey.length > LIMITS.apiKey ||
          !row.apiKey.trim() || /\s/.test(row.apiKey.trim())) throw invalidSettings("Format API key tidak valid.");
      apiKey = row.apiKey.trim();
    }
    return { provider: row.provider, model: row.model, ...(apiKey !== undefined ? { apiKey } : {}) };
  });
  return { primary: body.primary as AiProvider | null, fallback: body.fallback as AiProvider | null, providers };
}
export function mergeSettings(companyId: string, current: StoredAiSettings, input: SettingsInput): StoredAiSettings {
  const providers = new Map(current.providers.map(row => [row.provider, row]));
  for (const row of input.providers) {
    if (row.apiKey === null) { providers.delete(row.provider); continue; }
    const old = providers.get(row.provider);
    if (!old && !row.apiKey) continue;
    providers.set(row.provider, {
      provider: row.provider, model: row.model,
      encryptedKey: row.apiKey ? encryptSecret(row.apiKey, providerSecretContext(companyId, row.provider)) : old!.encryptedKey,
      lastTestedAt: row.apiKey || row.model !== old?.model ? null : old!.lastTestedAt,
    });
  }
  if (input.primary) {
    if (!providers.has(input.primary) || (input.fallback && !providers.has(input.fallback))) {
      throw invalidSettings("Pasang API key untuk provider utama dan cadangan yang dipilih.");
    }
    if (!providers.has("google")) throw invalidSettings("Pasang key Google Gemini untuk embedding dokumen saat memakai BYOK.");
  }
  return { primary: input.primary, fallback: input.fallback, legacy: false, providers: [...providers.values()] };
}
