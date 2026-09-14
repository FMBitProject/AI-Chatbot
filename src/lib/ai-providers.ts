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
  mode: "platform" | "byok";
  primary: AiProvider | null;
  fallback: AiProvider | null;
  legacy: boolean;
  providers: AiProviderStatus[];
}
