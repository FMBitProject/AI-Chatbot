export const state = { indexing: 0, requeued: [], quota: null, generated: 0, outage: false };
export async function requireAdmin() { return { ok: true, user: { companyId: "api-test" } }; }
export async function requireUser() { return { ok: true, user: { id: "api-user", companyId: "api-test" } }; }
export async function resolvePlanById(id) {
  return { company: { id }, subscription: { plan: "professional" }, limits: { maxDocuments: 100 } };
}
export async function consumeQuestionQuota() { return state.quota; }
export async function refundQuestionQuota() {}
export async function runIndexingPass() { state.indexing++; return { remaining: 0 }; }
export async function requeueDocument(companyId, id) { state.requeued.push([companyId, id]); return true; }
export function resolveByok() { return { ok: true }; }
export async function getEmbedding() { if (state.outage) throw new Error("Provider unavailable"); return [1]; }
export async function retrieveChunks() { return []; }
export async function generateWithFallback() { state.generated++; return { text: "Answer", model: { id: "test-model" } }; }
export function isRateLimitFailure() { return false; }
export async function alertOps() {}
