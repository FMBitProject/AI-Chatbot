import MidtransClient from "midtrans-client";

let _snap: MidtransClient.Snap | null = null;

export function getSnap() {
  if (!_snap) {
    _snap = new MidtransClient.Snap({
      isProduction: process.env.MIDTRANS_ENV === "production",
      serverKey: process.env.MIDTRANS_SERVER_KEY!,
      clientKey: process.env.MIDTRANS_CLIENT_KEY!,
    });
  }
  return _snap;
}

// Plan pricing and names now live in @/lib/pricing (single source of truth).

/**
 * Maps a Midtrans transaction_status that closes an order for good onto the
 * status we store, or null when the order is still open (pending, capture
 * awaiting fraud review, settlement, refunds we don't act on).
 *
 * "cancel"/"deny" and "expire" are both terminal but not the same thing —
 * rejected versus never completed — and the dashboard shows a different badge
 * for each, so the distinction is kept rather than flattened into "failed".
 *
 * Shared by the webhook and the verify route so a notification and a manual
 * status check can never record the same outcome differently.
 */
export function closedTransactionStatus(
  transactionStatus: string | undefined,
): "failed" | "expired" | null {
  if (transactionStatus === "cancel" || transactionStatus === "deny") return "failed";
  if (transactionStatus === "expire") return "expired";
  return null;
}
