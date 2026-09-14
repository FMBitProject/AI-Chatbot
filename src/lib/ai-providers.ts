// Shared public catalog; no credentials or server imports in this module.
export const AI_PROVIDERS = ["groq", "google", "openai", "anthropic"] as const;
export type AiProvider = typeof AI_PROVIDERS[number];
export const PROVIDER_CATALOG: Record<AiProvider, { label: string; models: readonly string[]; keysUrl: string }> = {
  groq: { label: "Groq", models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"], keysUrl: "https://console.groq.com/keys" },
  google: { label: "Google Gemini", models: ["gemini-3.5-flash"], keysUrl: "https://aistudio.google.com/apikey" },
  openai: { label: "OpenAI", models: ["gpt-4.1-mini", "gpt-4.1"], keysUrl: "https://platform.openai.com/api-keys" },
  anthropic: { label: "Anthropic Claude", models: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"], keysUrl: "https://platform.claude.com/settings/keys" },
};
export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && AI_PROVIDERS.some(p => p === value);
}
export function isProviderModel(provider: AiProvider, model: unknown): model is string {
  return typeof model === "string" && PROVIDER_CATALOG[provider].models.includes(model);
}
export interface AiProviderStatus {
  provider: AiProvider;
  model: string;
  hasKey: boolean;
  lastTestedAt: string | null;
}
export interface AiSettingsView {
  revision: string;
  mode: "platform" | "byok";
  primary: AiProvider | null;
  fallback: AiProvider | null;
  legacy: boolean;
  providers: AiProviderStatus[];
}

export function isAiSettingsView(value: unknown): value is AiSettingsView {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AiSettingsView>;
  if (typeof data.revision !== "string" || !/^[a-f0-9]{64}$/.test(data.revision) ||
      (data.mode !== "platform" && data.mode !== "byok") || typeof data.legacy !== "boolean" ||
      (data.primary !== null && !isAiProvider(data.primary)) ||
      (data.fallback !== null && !isAiProvider(data.fallback)) ||
      data.mode !== (data.primary ? "byok" : "platform") ||
      (!data.primary && data.fallback) || (data.primary && data.primary === data.fallback) ||
      !Array.isArray(data.providers) || data.providers.length !== AI_PROVIDERS.length) return false;
  const seen = new Set<AiProvider>();
  return data.providers.every(row => {
    if (!row || !isAiProvider(row.provider) || seen.has(row.provider) || typeof row.model !== "string" || !row.model ||
        typeof row.hasKey !== "boolean" || (row.lastTestedAt !== null &&
        (typeof row.lastTestedAt !== "string" || !Number.isFinite(Date.parse(row.lastTestedAt))))) return false;
    seen.add(row.provider);
    return true;
  });
}
