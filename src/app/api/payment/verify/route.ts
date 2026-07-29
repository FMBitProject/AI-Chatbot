import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { users, companies, transactions } from "@/lib/db/schema";
import { and, eq, desc, ne } from "drizzle-orm";
import { computeRenewedExpiry, isPaidPlan, isSubscriptionActive, planRank } from "@/lib/pricing";
import { consumeRateLimit } from "@/lib/rate-limit";

// Every call costs us an outbound Midtrans status request, so cap how fast a
// single admin can trigger them. Generous enough for the success page's
// automatic check plus manual "Cek Status" clicks.
const VERIFY_LIMIT = { max: 10, windowMs: 60 * 1000 };

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only, like checkout (see payment/create) — this route settles the
  // company's subscription, so an ordinary employee has no business calling it.
  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  try {
    ({ plan } = await req.json() as { plan: unknown });
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  if (!isPaidPlan(plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  // The newest transaction *for this plan*, rather than the newest overall: an
  // admin who starts a second checkout before the first one settles would
  // otherwise put the paid order out of reach of this route forever, since it
  // would only ever look at the newer row.
  const [tx] = await db.select().from(transactions)
    .where(and(eq(transactions.companyId, companyId), eq(transactions.plan, plan)))
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  if (!tx) {
    return NextResponse.json({ error: "No matching transaction" }, { status: 404 });
  }

  // Verify with Midtrans API
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  const isProduction = process.env.MIDTRANS_ENV === "production";
  const baseUrl = isProduction
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

  // Only the Midtrans call is guarded here. Database failures below get their
  // own handler, so an internal error is never reported as "Midtrans API error".
  let data: { transaction_status?: string; fraud_status?: string };
  try {
    const res = await fetch(`${baseUrl}/${tx.orderId}/status`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
    // A 401 (wrong server key) or 5xx still returns a JSON body, just without a
    // transaction_status. Without this check that body would fall through and be
    // reported to the admin as "payment still pending", hiding our own outage.
    if (!res.ok) {
      console.error(`[payment/verify] Midtrans returned ${res.status} for order=${tx.orderId}`);
      return NextResponse.json({ error: "Midtrans API error" }, { status: 502 });
    }
    data = await res.json() as { transaction_status?: string; fraud_status?: string };
  } catch (err) {
    console.error(`[payment/verify] Midtrans request failed for order=${tx.orderId}:`, err);
    return NextResponse.json({ error: "Midtrans API error" }, { status: 502 });
  }

  const isSuccess =
    (data.transaction_status === "capture" && data.fraud_status === "accept") ||
    data.transaction_status === "settlement";

  if (!isSuccess) {
    // Record a definitive failure, mirroring the webhook, so an order Midtrans
    // has already closed doesn't sit in the payment history as "Menunggu"
    // forever when no notification reaches us. Best-effort: the caller still
    // gets the status even if this write fails.
    const isFailed =
      data.transaction_status === "cancel" ||
      data.transaction_status === "deny" ||
      data.transaction_status === "expire";
    if (isFailed) {
      await db.update(transactions)
        .set({ status: "failed" })
        .where(and(eq(transactions.id, tx.id), ne(transactions.status, "paid")))
        .catch((err) => console.error(`[payment/verify] Could not mark order=${tx.orderId} failed:`, err));
    }

    if (data.transaction_status === "pending") {
      return NextResponse.json({ ok: true, upgraded: false, status: "pending" });
    }
    return NextResponse.json({ ok: true, upgraded: false, status: data.transaction_status });
  }

  try {
    // Claiming the transaction and granting the plan must be one atomic unit.
    // Midtrans reports a settled order as settled forever, and both this route
    // and the webhook can be called repeatedly, so the `status <> 'paid'` guard
    // is what stops every extra call from stacking another month onto
    // planExpiresAt (computeRenewedExpiry adds to the remaining time). But the
    // guard alone would be worse than the bug it fixes: if the process died
    // between claiming and granting, the order would read as paid while the plan
    // was never applied, and every retry would skip it — a paying customer stuck
    // with no subscription and no way back. Inside a transaction, a failure
    // rolls the claim back too, so the next delivery settles it cleanly.
    await withTransaction(async (dbTx) => {
      const claimed = await dbTx.update(transactions)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(eq(transactions.id, tx.id), ne(transactions.status, "paid")))
        .returning({ id: transactions.id });

      // Zero rows means someone already settled this order — the webhook, or an
      // earlier click. Their transaction committed the grant, so there is
      // nothing left to do here.
      if (claimed.length === 0) return;

      // FOR UPDATE, because the grant below is a read-modify-write: the new
      // expiry is computed in JS from the value read here. Two *different* paid
      // orders for the same company lock different `transactions` rows, so
      // nothing stops them reaching this point together; without the row lock
      // both would read the same expiry and the second COMMIT would overwrite
      // the first, silently swallowing a month the customer paid for.
      const [company] = await dbTx.select().from(companies)
        .where(eq(companies.id, companyId))
        .limit(1)
        .for("update");
      const now = new Date();
      const currentRank = isSubscriptionActive(company?.plan, company?.planExpiresAt, now)
        ? planRank(company?.plan)
        : 0;

      // Grant tx.plan, not the plan from the request body: the two are equal
      // (the row was selected by it), but reading it off the transaction keeps
      // the plan the customer is given entirely server-side.
      if (planRank(tx.plan) < currentRank) {
        // Downgrades are blocked at checkout (payment/create); if one still
        // reaches here, never strip a paying customer's higher plan.
        console.warn(`[payment/verify] Ignored downgrade: company=${companyId} current=${company?.plan} purchased=${tx.plan}`);
        return;
      }

      const planExpiresAt = computeRenewedExpiry(company?.planExpiresAt, now);
      const granted = await dbTx.update(companies)
        .set({ plan: tx.plan, planExpiresAt })
        .where(eq(companies.id, companyId))
        .returning({ id: companies.id });

      // Nothing updated means the company row vanished under us. Fail loudly so
      // the claim rolls back, instead of banking a payment that granted nothing.
      if (granted.length === 0) {
        throw new Error(`company ${companyId} not found while granting plan for order=${tx.orderId}`);
      }
      console.log(`[payment/verify] Plan set: company=${companyId} plan=${tx.plan} expires=${planExpiresAt.toISOString()}`);
    });
  } catch (err) {
    console.error(`[payment/verify] Failed to settle order=${tx.orderId}:`, err);
    return NextResponse.json({ error: "Gagal menerapkan pembayaran. Silakan coba lagi." }, { status: 500 });
  }

  // Reaching here means the plan is in force: either this call applied it, or a
  // previous one already committed it. The success page keys its "Pembayaran
  // Berhasil" state off this flag, so reporting false on an order the webhook
  // settled first would tell a paying customer their upgrade is still pending.
  return NextResponse.json({ ok: true, upgraded: true });
}
