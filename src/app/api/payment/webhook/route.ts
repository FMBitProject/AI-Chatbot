import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { transactions, companies } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { createHash } from "crypto";
import { computeRenewedExpiry, isSubscriptionActive, planRank } from "@/lib/pricing";

interface MidtransNotification {
  order_id: string;
  transaction_status: string;
  fraud_status?: string;
  signature_key: string;
  status_code: string;
  gross_amount: string;
}

export async function POST(req: NextRequest) {
  // A body we cannot parse will never parse, so answer 400 rather than throwing:
  // an unhandled error becomes a 500, which Midtrans would retry indefinitely.
  let body: MidtransNotification;
  try {
    body = await req.json() as MidtransNotification;
  } catch {
    console.error("[payment] Notification with an unparseable body rejected");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Verify signature
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  const signatureKey = createHash("sha512")
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
    .digest("hex");

  if (signatureKey !== body.signature_key) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const [tx] = await db.select().from(transactions).where(eq(transactions.orderId, body.order_id)).limit(1);
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const isSuccess =
    body.transaction_status === "capture" && body.fraud_status === "accept" ||
    body.transaction_status === "settlement";

  const isFailed =
    body.transaction_status === "cancel" ||
    body.transaction_status === "deny" ||
    body.transaction_status === "expire";

  // Every database failure below returns 500 on purpose: Midtrans retries a
  // notification it could not deliver, and the work here is written to be safe
  // to repeat, so a retry is exactly the recovery we want.
  try {
    if (isSuccess) {
      // Midtrans re-sends a notification when our response is slow, non-2xx, or
      // simply on its retry schedule, and the same order can also be settled by
      // payment/verify. Extending the plan is not idempotent
      // (computeRenewedExpiry stacks a month onto the remaining time), so only
      // the delivery whose conditional UPDATE actually flips status → paid gets
      // to apply it; duplicates match zero rows and stop.
      //
      // Claim and grant share one transaction so they cannot come apart: a crash
      // between them would otherwise leave the order marked paid with no plan
      // granted, and every retry would skip it as a duplicate — the customer's
      // money taken and their subscription never activated, unrecoverably.
      const applied = await withTransaction(async (dbTx) => {
        const claimed = await dbTx.update(transactions)
          .set({ status: "paid", paidAt: new Date() })
          .where(and(eq(transactions.orderId, body.order_id), ne(transactions.status, "paid")))
          .returning({ id: transactions.id });

        if (claimed.length === 0) return false;

        // FOR UPDATE, because the grant below is a read-modify-write: the new
        // expiry is computed in JS from the value read here. Two *different*
        // paid orders for the same company lock different `transactions` rows,
        // so nothing stops them reaching this point together; without the row
        // lock both would read the same expiry and the second COMMIT would
        // overwrite the first, silently swallowing a month the customer paid for.
        const [company] = await dbTx.select().from(companies)
          .where(eq(companies.id, tx.companyId))
          .limit(1)
          .for("update");
        const now = new Date();
        const currentRank = isSubscriptionActive(company?.plan, company?.planExpiresAt, now)
          ? planRank(company?.plan)
          : 0;

        if (planRank(tx.plan) < currentRank) {
          // Downgrades are blocked at checkout (payment/create); if one still reaches
          // here, never strip a paying customer's higher plan — leave it untouched.
          console.warn(`[payment] Ignored downgrade from webhook: company=${tx.companyId} current=${company?.plan} purchased=${tx.plan}`);
          return true;
        }

        // Renewal/upgrade stacks onto any remaining time; a lapsed plan starts fresh.
        const planExpiresAt = computeRenewedExpiry(company?.planExpiresAt, now);
        const granted = await dbTx.update(companies)
          .set({ plan: tx.plan, planExpiresAt })
          .where(eq(companies.id, tx.companyId))
          .returning({ id: companies.id });

        // Nothing updated means the company row vanished under us. Throw so the
        // claim rolls back rather than banking a payment that granted nothing.
        if (granted.length === 0) {
          throw new Error(`company ${tx.companyId} not found while granting plan for order=${body.order_id}`);
        }

        console.log(`[payment] Plan set: company=${tx.companyId} plan=${tx.plan} expires=${planExpiresAt.toISOString()}`);
        return true;
      });

      if (!applied) {
        console.log(`[payment] Duplicate paid notification ignored: order=${body.order_id}`);
      }
    } else if (isFailed) {
      // `status <> 'paid'` on both branches so a late cancel/expire/pending
      // notification can never rewrite an order we already settled and granted.
      await db.update(transactions)
        .set({ status: "failed" })
        .where(and(eq(transactions.orderId, body.order_id), ne(transactions.status, "paid")));
    } else if (body.transaction_status === "pending") {
      await db.update(transactions)
        .set({ status: "pending" })
        .where(and(eq(transactions.orderId, body.order_id), ne(transactions.status, "paid")));
    }
  } catch (err) {
    console.error(`[payment] Failed to process notification for order=${body.order_id} status=${body.transaction_status}:`, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
