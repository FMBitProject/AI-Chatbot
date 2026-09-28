import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { withTenant, type TenantTx } from "@/lib/db/tenant";
import { companyPrivacy, documents, privacyEvents } from "./db/schema";
import type { AiProvider } from "./ai-providers";
import { DEFAULT_ALLOWED_PROVIDERS, assertPrivacyPolicy, PrivacyBlockedError, type PrivacyContext } from "./privacy-policy";

export async function readPrivacy(tx: TenantTx, companyId: string) {
  const [row] = await tx.select().from(companyPrivacy).where(eq(companyPrivacy.companyId, companyId));
  return row ?? { companyId, allowedProviders: [...DEFAULT_ALLOWED_PROVIDERS], revision: 0, updatedAt: null };
}
export async function loadPrivacy(companyId: string, signal?: AbortSignal): Promise<PrivacyContext> {
  const row = await withTenant(companyId, tx => readPrivacy(tx, companyId), { signal, timeoutMs: 5_000 });
  return { companyId, revision: row.revision, allowedProviders: row.allowedProviders, documentIds: [], purpose: "answer" };
}

// Separate from the company row: slow provider headers must not block quota
// counters or indexing lease renewals. Writers take this lock before changing
// documents or policy; readers keep the shared lock until dispatch completes.
export async function lockPrivacyMutation(tx: TenantTx, companyId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`privacy:${companyId}`}, 0))`);
}
// Caller holds the company row lock. Invalidate all earlier context, including
// legacy answers with incomplete source tracking. Keep history for the reader.
export async function advancePrivacy(tx: TenantTx, companyId: string, action: string, documentIds: string[] = [], allowedProviders?: string[]) {
  await lockPrivacyMutation(tx, companyId);
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
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    callerSignal?.throwIfAborted();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Provider dispatch timed out", "TimeoutError")), 20_000);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
    try {
      const outcome = await withTenant(context.companyId, async (tx, transactionSignal) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${`privacy:${context.companyId}`}, 0))`);
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
        const dispatchSignal = transactionSignal
          ? AbortSignal.any([signal, transactionSignal]) : signal;
        dispatchSignal.throwIfAborted();
        // Catch transport errors inside the transaction so failed attempts are
        // still audited. The shared lock ends after headers, not after streaming
        // the entire response; an already-sent request cannot be recalled.
        try {
          return { response: await fetch(input, { ...init, signal: dispatchSignal }) };
        } catch (error) {
          return { error };
        }
      }, { signal, timeoutMs: 20_000 });
      if ("error" in outcome) throw outcome.error;
      return outcome.response;
    } finally {
      clearTimeout(timer);
    }
  };
}
