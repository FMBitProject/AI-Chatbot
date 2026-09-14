// Route-boundary fixture: production guards are covered by security tests.
// Keep provider/model SDKs real so fake HTTP responses exercise their contracts.
export const authState = { status: "admin", companyId: "a" };
export async function requireAdmin() {
  if (authState.status !== "admin") return { ok: false,
    response: Response.json({ error: "denied" }, { status: authState.status === "anonymous" ? 401 : 403 }) };
  return { ok: true, user: { id: "admin-test", companyId: authState.companyId, role: "admin" } };
}
export async function consumeRateLimit() { return { ok: true, retryAfter: 0 }; }
