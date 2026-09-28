import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { withTenant, type TenantTx } from "@/lib/db/tenant";
import { companyPrivacy, documents, privacyEvents } from "./db/schema";
import type { AiProvider } from "./ai-providers";
import { DEFAULT_ALLOWED_PROVIDERS, assertPrivacyPolicy, PrivacyBlockedError, type PrivacyContext } from "./privacy-policy";

export async function readPrivacy(tx: TenantTx, companyId: string) {
  const [row] = await tx.select().from(companyPrivacy).where(eq(companyPrivacy.companyId, companyId));
  return row ?? { companyId, allowedProviders: [...DEFAULT_ALLOWED_PROVIDERS], revision: 0, updatedAt: null };
}
export async function loadPrivacy(companyId: string): Promise<PrivacyContext> {
  const row = await withTenant(companyId, tx => readPrivacy(tx, companyId));
  return { companyId, revision: row.revision, allowedProviders: row.allowedProviders, documentIds: [], purpose: "answer" };
}
// Caller holds the company row lock. Invalidate all earlier context, including
// legacy answers with incomplete source tracking. Keep history for the reader.
export async function advancePrivacy(tx: TenantTx, companyId: string, action: string, documentIds: string[] = [], allowedProviders?: string[]) {
  const current = await readPrivacy(tx, companyId);
  const revision = current.revision + 1;
  await tx.insert(companyPrivacy).values({ companyId, revision, allowedProviders: allowedProviders ?? current.allowedProviders })
    .onConflictDoUpdate({ target: companyPrivacy.companyId, set: { revision, allowedProviders: allowedProviders ?? current.allowedProviders, updatedAt: new Date() } });
  await tx.insert(privacyEvents).values({ id: randomUUID(), companyId, revision, action, documentIds });
}

// At the SDK transport boundary: retries and fallbacks are checked too.
// Events record attempts, never bodies, credentials, or proof of receipt.
export function privacyFetch(context: PrivacyContext, provider: AiProvider): typeof fetch {
  return async (input, init) => {
    await withTenant(context.companyId, async tx => {
      const current = await readPrivacy(tx, context.companyId);
      assertPrivacyPolicy(context, current, provider);
      if (context.documentIds.length) {
        const ids = [...new Set(context.documentIds)];
        const rows = await tx.select({ id: documents.id, classification: documents.classification })
          .from(documents).where(and(eq(documents.companyId, context.companyId), inArray(documents.id, ids)));
        if (rows.length !== ids.length || rows.some(row => row.classification === "confidential")) throw new PrivacyBlockedError();
      }
      await tx.insert(privacyEvents).values({ id: randomUUID(), companyId: context.companyId,
        revision: context.revision, action: "provider_attempt", provider,
        purpose: context.purpose, documentIds: [...new Set(context.documentIds)] });
    });
    // Already-dispatched requests cannot be recalled. Do not hold a database
    // transaction across a potentially minute-long provider call.
    return fetch(input, init);
  };
}
