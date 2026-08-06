import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, transactions } from "@/lib/db/schema";
import { and, eq, desc, ne } from "drizzle-orm";
import { isPurchasablePlan } from "@/lib/pricing";
import { settlePaidOrder } from "@/lib/payment";
import {
  amountMatches,
  closedTransactionStatus,
  fetchMidtransStatus,
  isReversalStatus,
  isSettledStatus,
} from "@/lib/midtrans";
import { alertOps } from "@/lib/alerts";
import { consumeRateLimit } from "@/lib/rate-limit";

// Every call costs us an outbound Midtrans status request, so cap how fast a
// single admin can trigger them. Generous enough for the success page's
// automatic check plus manual "Cek Status" clicks.
const VERIFY_LIMIT = { max: 10, windowMs: 60 * 1000 };

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  // These messages are rendered verbatim in the dashboard's toast, so they are
  // written in Indonesian like the rest of the user-facing copy. (The webhook's
  // errors stay English — nothing but Midtrans ever reads them.)
  if (!session) {
    return NextResponse.json({ error: "Sesi Anda sudah berakhir. Silakan masuk kembali." }, { status: 401 });
  }

  // Admin-only, like checkout (see payment/create) — this route settles the
  // company's subscription, so an ordinary employee has no business calling it.
  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Hanya admin yang bisa memeriksa status pembayaran." }, { status: 403 });
  }
  const companyId = dbUser.companyId;

  const limit = consumeRateLimit(`payment-verify:${dbUser.id}`, VERIFY_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let plan: unknown;
  let orderId: unknown;
  try {
    ({ plan, orderId } = await req.json() as { plan: unknown; orderId?: unknown });
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  // Only a plan that can be bought can be verified as bought — `custom` is
  // granted by hand and never passes through Midtrans.
  if (!isPurchasablePlan(plan)) return NextResponse.json({ error: "Paket tidak dikenali." }, { status: 400 });
  if (orderId !== undefined && typeof orderId !== "string") {
    return NextResponse.json({ error: "ID pesanan tidak valid." }, { status: 400 });
  }
  // Trim once, then use the trimmed value for the lookup as well. Validating the
  // trimmed form but querying the raw one would answer "  IB-1  " with a 404 (no
  // such order) when what it really is, is a malformed request. An empty string
  // is rejected outright: it is falsy, so it would otherwise slip through to the
  // newest-order lookup and answer about a different order than the caller meant.
  const namedOrderId = orderId?.trim();
  if (namedOrderId === "") {
    return NextResponse.json({ error: "ID pesanan tidak valid." }, { status: 400 });
  }

  // Settle the order the caller actually named. The dashboard's "Cek Status"
  // button sits on one specific row, so without this it would check whichever
  // order happens to be newest — a company with two pending orders for the same
  // plan could never reach the older one, and the result would be reported as if
  // it were about the row that was clicked.
  //
  // The success page has no order id to send (the Midtrans callback URL only
  // carries ?plan=, see payment/create), so it still falls back to the newest
  // order for that plan.
  //
  // Both lookups are scoped to the caller's company, so an order id from another
  // tenant simply resolves to nothing.
  const [tx] = namedOrderId
    ? await db.select().from(transactions)
        .where(and(eq(transactions.companyId, companyId), eq(transactions.orderId, namedOrderId)))
        .limit(1)
    : await db.select().from(transactions)
        .where(and(eq(transactions.companyId, companyId), eq(transactions.plan, plan)))
        .orderBy(desc(transactions.createdAt))
        .limit(1);

  // The fallback lookup already filters on plan; this also holds the caller to it
  // when they named an order, so a mismatched pair can never come back as a
  // success about a plan the caller did not ask about.
  if (!tx || tx.plan !== plan) {
    return NextResponse.json({ error: "Tidak ada pesanan yang cocok." }, { status: 404 });
  }

  // A cancelled or denied order cannot change again, so answer from what we
  // already know instead of spending an outbound request on a question with a
  // settled answer. Only "failed" gets this treatment:
  //   - "expired" is NOT terminal from where we stand. A bank-transfer payment
  //     landing right at the deadline can still settle after Midtrans sent us
  //     the expire notification, and this route is exactly the recovery path
  //     when that settlement notification never arrives — short-circuiting here
  //     would lock a paid order out of ever being granted, with no self-serve
  //     way back for the customer.
  //   - "paid" still re-asks on purpose: that is how a later refund or
  //     chargeback on a settled order gets noticed here.
  if (tx.status === "failed") {
    return NextResponse.json({ ok: true, upgraded: false, status: tx.status, plan: tx.plan });
  }

  const status = await fetchMidtransStatus(tx.orderId, "[payment/verify]");
  if (!status.ok) {
    return NextResponse.json({ error: "Gagal menghubungi Midtrans. Coba lagi beberapa saat lagi." }, { status: 502 });
  }
  const data = status.data;

  if (!isSettledStatus(data)) {
    // Record a definitive close, mirroring the webhook, so an order Midtrans has
    // already finished doesn't sit in the payment history as "Menunggu" forever
    // when no notification reaches us. An order that ran out of time is stored
    // as "expired" rather than "failed" — both are terminal, but the dashboard
    // has a distinct badge for each and the distinction is the customer's
    // (rejected vs. never completed). Best-effort: the caller still gets the
    // status even if this write fails.
    const closedStatus = closedTransactionStatus(data.transaction_status);
    if (closedStatus) {
      await db.update(transactions)
        .set({ status: closedStatus })
        .where(and(eq(transactions.id, tx.id), ne(transactions.status, "paid")))
        .catch((err) => console.error(`[payment/verify] Could not mark order=${tx.orderId} ${closedStatus}:`, err));
    }

    // A refund or chargeback can surface here too, if the admin checks an order
    // whose money has since gone back. Same policy as the webhook: nothing is
    // automated, but it must not pass unnoticed. The alert is deduplicated per
    // order, so repeated "Cek Status" clicks on a refunded order do not turn
    // into repeated mail.
    if (isReversalStatus(data.transaction_status)) {
      await alertOps({
        dedupeKey: `payment-reversal:${tx.orderId}`,
        subject: "Money reversed on a paid order — needs manual review",
        details: {
          order: tx.orderId,
          company: companyId,
          plan: tx.plan,
          status: data.transaction_status ?? "unknown",
          amount: tx.amount,
        },
      });
    }

    if (data.transaction_status === "pending") {
      return NextResponse.json({ ok: true, upgraded: false, status: "pending", plan: tx.plan });
    }
    return NextResponse.json({ ok: true, upgraded: false, status: data.transaction_status, plan: tx.plan });
  }

  // Midtrans says paid — for the amount we actually billed, or not at all. The
  // same check the webhook makes, for the same reason: a plan is never granted
  // off a sum nobody here recognises.
  if (!amountMatches(data.gross_amount, tx.amount)) {
    await alertOps({
      dedupeKey: `payment-amount:${tx.orderId}`,
      subject: "Midtrans confirms a payment for an amount we did not charge",
      details: {
        order: tx.orderId,
        company: companyId,
        plan: tx.plan,
        paid: String(data.gross_amount),
        expected: tx.amount,
      },
    });
    return NextResponse.json(
      { error: "Pembayaran perlu diperiksa manual. Tim kami akan menindaklanjuti." },
      { status: 409 },
    );
  }

  try {
    // Shared with the webhook and the reconciliation sweep, because all three
    // can reach the same order at any time and in any order. settlePaidOrder is
    // written to be safe to repeat: whichever call claims the order grants the
    // plan, and the rest come back "duplicate" instead of stacking a second
    // month onto planExpiresAt.
    await settlePaidOrder(tx, "[payment/verify]");
  } catch (err) {
    console.error(`[payment/verify] Failed to settle order=${tx.orderId}:`, err);
    return NextResponse.json({ error: "Gagal menerapkan pembayaran. Silakan coba lagi." }, { status: 500 });
  }

  // Reaching here means a paid plan is in force: this call applied it, a
  // previous one already committed it, or the company was already on something
  // higher (the "nothing-granted" branch above, now on its way to an operator).
  // The success page keys its "Pembayaran Berhasil" state off this flag, so
  // reporting false on an order the webhook settled first would tell a paying
  // customer their upgrade is still pending. In the third case the customer is
  // no worse off than before the click, and the money question needs a human
  // rather than a different screen.
  //
  // `plan` is echoed from the transaction row so the caller can name the plan it
  // actually settled instead of trusting its own query string.
  return NextResponse.json({ ok: true, upgraded: true, plan: tx.plan });
}
