import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  const body = await req.json() as MidtransNotification;

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

  if (isSuccess) {
    await db.update(transactions)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(transactions.orderId, body.order_id));

    const [company] = await db.select().from(companies).where(eq(companies.id, tx.companyId)).limit(1);
    const now = new Date();
    const currentRank = isSubscriptionActive(company?.plan, company?.planExpiresAt, now)
      ? planRank(company?.plan)
      : 0;

    if (planRank(tx.plan) < currentRank) {
      // Downgrades are blocked at checkout (payment/create); if one still reaches
      // here, never strip a paying customer's higher plan — leave it untouched.
      console.warn(`[payment] Ignored downgrade from webhook: company=${tx.companyId} current=${company?.plan} purchased=${tx.plan}`);
    } else {
      // Renewal/upgrade stacks onto any remaining time; a lapsed plan starts fresh.
      const planExpiresAt = computeRenewedExpiry(company?.planExpiresAt, now);
      await db.update(companies)
        .set({ plan: tx.plan, planExpiresAt })
        .where(eq(companies.id, tx.companyId));
      console.log(`[payment] Plan set: company=${tx.companyId} plan=${tx.plan} expires=${planExpiresAt.toISOString()}`);
    }
  } else if (isFailed) {
    await db.update(transactions)
      .set({ status: "failed" })
      .where(eq(transactions.orderId, body.order_id));
  } else if (body.transaction_status === "pending") {
    await db.update(transactions)
      .set({ status: "pending" })
      .where(eq(transactions.orderId, body.order_id));
  }

  return NextResponse.json({ ok: true });
}
