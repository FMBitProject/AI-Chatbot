import { AI_PROVIDERS, isAiProvider, type AiProvider } from "./ai-providers";

export const CLASSIFICATIONS = ["normal", "internal", "confidential"] as const;
export type DocumentClassification = typeof CLASSIFICATIONS[number];
export function classificationInput(value: unknown): DocumentClassification | null {
  if (value === undefined || value === null) return "internal";
  return CLASSIFICATIONS.includes(value as DocumentClassification) ? value as DocumentClassification : null;
}
export const DEFAULT_ALLOWED_PROVIDERS: AiProvider[] = [...AI_PROVIDERS];
export function allowedProvidersInput(value: unknown): AiProvider[] | null {
  return Array.isArray(value) && value.length <= AI_PROVIDERS.length && value.every(isAiProvider)
    && new Set(value).size === value.length ? value : null;
}
export interface PrivacyContext {
  companyId: string;
  revision: number;
  allowedProviders: string[];
  documentIds: string[];
  purpose: "query_embedding" | "document_embedding" | "answer" | "summary" | "suggestions" | "connection_test";
}
export class PrivacyBlockedError extends Error {
  constructor() {
    super("Pemrosesan diblokir oleh pengaturan privasi atau konteks dokumen telah berubah. Muat ulang dan periksa pengaturan privasi.");
    this.name = "PrivacyBlockedError";
  }
}
export function assertPrivacyPolicy(context: PrivacyContext, current: { revision: number; allowedProviders: string[] }, provider: AiProvider) {
  if (context.revision !== current.revision || !current.allowedProviders.includes(provider)) throw new PrivacyBlockedError();
}

export function isPrivacyBlocked(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current instanceof PrivacyBlockedError) return true;
    current = current.cause;
  }
  return false;
}
