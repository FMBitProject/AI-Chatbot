import MidtransClient from "midtrans-client";
import { createHash, timingSafeEqual } from "crypto";

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
 * The server key, or a thrown error when it is not configured.
 *
 * Never fall back to "" here. The webhook's signature is
 * sha512(order_id + status_code + gross_amount + serverKey), and every one of
 * those first three fields is guessable by an attacker: the order id is handed
 * to the client at checkout and its format is deterministic, the amount is on
 * the pricing page, and the status code is one of three values. An empty key
 * therefore turns a signed endpoint into an unauthenticated one that grants paid
 * plans. Refusing to run is the only safe response to a missing key.
 */
export function requireServerKey(): string {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) {
    throw new Error("MIDTRANS_SERVER_KEY environment variable is not set.");
  }
  return key;
}

/** The fields of a Midtrans notification that its signature covers. */
interface SignedNotificationFields {
  order_id?: unknown;
  status_code?: unknown;
  gross_amount?: unknown;
  signature_key?: unknown;
}

/**
 * Whether a notification really came from Midtrans.
 *
 * Note what this does *not* establish: the signature covers only order_id,
 * status_code and gross_amount, so `transaction_status` and `fraud_status` —
 * the two fields that decide whether a plan is granted — are unauthenticated.
 * A caller acting on them must confirm the outcome against fetchMidtransStatus()
 * rather than trusting the notification body.
 */
export function isValidNotificationSignature(
  body: SignedNotificationFields,
  serverKey: string,
): boolean {
  const provided = body.signature_key;
  if (typeof provided !== "string") return false;

  const expected = createHash("sha512")
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
    .digest("hex");

  // Constant-time compare so the response time cannot be used to recover the
  // expected digest byte by byte. timingSafeEqual throws on a length mismatch,
  // so that is checked first — the length is a fixed 128 hex chars and gives
  // nothing away.
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/** The subset of Midtrans' status payload the payment flow reads. */
export interface MidtransStatus {
  transaction_status?: string;
  fraud_status?: string;
  gross_amount?: string;
}

/**
 * Asks Midtrans what it thinks the state of an order is. This is the
 * authoritative answer — unlike a notification body, it is fetched over a
 * connection we opened and authenticated ourselves, so nothing in it can be
 * forged or replayed by a third party.
 *
 * Returns `ok: false` for every failure (unset key, network error, non-2xx)
 * rather than throwing; callers decide what to tell the customer or Midtrans.
 * Details go to the log under `logPrefix` so the two callers stay
 * distinguishable.
 */
export async function fetchMidtransStatus(
  orderId: string,
  logPrefix: string,
): Promise<{ ok: true; data: MidtransStatus } | { ok: false }> {
  const baseUrl = process.env.MIDTRANS_ENV === "production"
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

  let serverKey: string;
  try {
    serverKey = requireServerKey();
  } catch (err) {
    console.error(`${logPrefix} Cannot check order=${orderId}:`, err);
    return { ok: false };
  }

  try {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(orderId)}/status`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      // Payment state is the last thing that may be served from a cache. POST
      // handlers are not cached in this version of Next.js and both callers
      // already read the request, which opts the route out anyway — this is
      // belt and braces on a call where a stale answer means a wrong plan.
      cache: "no-store",
    });
    // A 401 (wrong server key) or a 5xx still returns a JSON body, just without
    // a transaction_status. Without this check that body would fall through and
    // be read as "payment still pending", hiding our own outage.
    if (!res.ok) {
      console.error(`${logPrefix} Midtrans returned ${res.status} for order=${orderId}`);
      return { ok: false };
    }
    return { ok: true, data: await res.json() as MidtransStatus };
  } catch (err) {
    console.error(`${logPrefix} Midtrans request failed for order=${orderId}:`, err);
    return { ok: false };
  }
}

/**
 * Whether Midtrans considers an order paid. "capture" alone is not enough — a
 * card payment sits in capture while fraud review runs, and only `accept` means
 * the money is ours.
 *
 * Shared so the webhook and the verify route can never disagree about what
 * counts as paid.
 */
export function isSettledStatus(status: MidtransStatus): boolean {
  return (
    (status.transaction_status === "capture" && status.fraud_status === "accept") ||
    status.transaction_status === "settlement"
  );
}

/**
 * Whether an amount Midtrans reports is the amount we actually charged.
 *
 * Compared numerically because the two are formatted differently: we store
 * "199000", Midtrans reports "199000.00". Anything unparseable counts as a
 * mismatch — a missing amount is not a reason to hand out a plan.
 */
export function amountMatches(reported: unknown, expected: string): boolean {
  const a = Number(reported);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === b;
}

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

/**
 * Money going back to the customer after we already settled the order: a refund
 * issued from the Midtrans dashboard, or a chargeback raised with their bank.
 *
 * Nothing is automated for these. The subscription stays active, and the
 * transaction keeps its "paid" status on purpose — every idempotency guard in
 * the payment flow is `status <> 'paid'`, so rewriting it would let a later
 * duplicate notification re-claim the order and grant another month. Revoking
 * access is a business decision (the terms say payments are non-refundable), so
 * these are surfaced in the logs for a human instead of being handled silently.
 */
export function isReversalStatus(transactionStatus: string | undefined): boolean {
  return (
    transactionStatus === "refund" ||
    transactionStatus === "partial_refund" ||
    transactionStatus === "chargeback" ||
    transactionStatus === "partial_chargeback"
  );
}
