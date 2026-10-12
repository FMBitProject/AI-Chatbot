import { requireServerKey } from "@/lib/midtrans";

// Core API 404 does not revoke a Snap token. Cancel the session itself before
// replacing an unopened checkout whose price is stale.
// https://docs.midtrans.com/reference/cancel-a-snap-session
export async function cancelSnapSession(token: string): Promise<boolean> {
  try {
    const base = process.env.MIDTRANS_ENV === "production"
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com";
    const res = await fetch(`${base}/snap/v1/transactions/${encodeURIComponent(token)}/cancel`, {
      method: "POST",
      headers: {
        // This endpoint documents the raw server key, unlike Core API Basic auth.
        Authorization: requireServerKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return false;

    if (res.ok && "canceled_at" in data
      && typeof data.canceled_at === "string"
      && Number.isFinite(Date.parse(data.canceled_at))) return true;

    // A retry after a lost response may find the session already cancelled.
    // Neither "token not found" nor "Transaction is on progress" proves that
    // it is safe to expose another payment instrument.
    return (res.ok || res.status === 400 || res.status === 409)
      && "error_messages" in data
      && Array.isArray(data.error_messages)
      && data.error_messages.length === 1
      && data.error_messages[0] === "token already canceled";
  } catch {
    // Do not log the request URL or headers: they contain the token and key.
    console.error("[payment/create] Could not confirm Snap session cancellation");
    return false;
  }
}
