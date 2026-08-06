import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import {
  amountMatches,
  closedTransactionStatus,
  createSnapTransaction,
  fetchMidtransStatus,
  isSettledStatus,
} from "@/lib/midtrans";
import { settlePaidOrder } from "@/lib/payment";
import { getPlanPrice, PLAN_NAMES, isPurchasablePlan, planRank, planRankInForce } from "@/lib/pricing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

// Each accepted call opens a real transaction at Midtrans and writes a row here,
// so a stuck retry loop or a stolen session should not be able to run up either
// without limit. Well above what a customer clicking "Bayar" can reach.
const CREATE_LIMIT = { max: 5, windowMs: 60 * 1000 };

// How long a pending order is offered back instead of a new one. Matches the
// default Midtrans transaction lifetime: past it the Snap token and any virtual
// account issued with it are dead, so there is nothing left to reuse.
const PENDING_REUSE_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = consumeRateLimit(`payment-create:${dbUser.id}`, CREATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Terlalu banyak percobaan pembayaran. Coba lagi sebentar lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // Guarded, so a body that is not JSON is the 400 it actually is. Unguarded,
  // req.json() throws and Next answers 500 — which reads in the logs as "our
  // server is broken" for what is only a malformed request.
  let plan: unknown;
  try {
    ({ plan } = await req.json() as { plan: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Purchasable, not merely paid: `custom` has no list price, so accepting it
  // here would mean charging an unlimited plan whatever the request asked for.
  if (!isPurchasablePlan(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Block buying a lower tier while a paid subscription is still active — a
  // downgrade would strip time the customer already paid for. They can switch
  // once the current period lapses. Renewals (same tier) and upgrades are fine.
  if (planRank(plan) < planRankInForce(company.plan, company.planExpiresAt)) {
    return NextResponse.json(
      {
        error: "downgrade_not_allowed",
        message:
          "Langganan Anda saat ini masih aktif. Beralih ke paket yang lebih rendah bisa dilakukan setelah periode berjalan berakhir.",
      },
      { status: 409 },
    );
  }

  // Never hand out a second live way to pay for the same thing.
  //
  // Each checkout opens its own Midtrans transaction, and for the payment
  // methods most customers here use that means its own virtual account number,
  // valid until the order expires. So a customer who clicks "Bayar" twice — or
  // comes back the next day because they lost the first VA number — ends up
  // holding two numbers that both work, and transferring to both charges them
  // twice for one month. Reusing the order they already have is what makes
  // clicking twice harmless.
  const [pending] = await db.select().from(transactions)
    .where(and(
      eq(transactions.companyId, dbUser.companyId),
      eq(transactions.plan, plan),
      eq(transactions.status, "pending"),
      gt(transactions.createdAt, new Date(Date.now() - PENDING_REUSE_MS)),
    ))
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  if (pending?.snapToken) {
    // Ask Midtrans what became of it. The default is to reuse — including when
    // this call fails, since a token minted within the window is almost
    // certainly still good and reusing it can never create a second way to pay.
    // Only a definite answer that the order is finished starts a new one.
    const existing = await fetchMidtransStatus(pending.orderId, "[payment/create]");

    if (existing.ok && isSettledStatus(existing.data)) {
      // Already paid, and we never recorded it — the notification was lost and
      // the customer came back to pay again. Selling them a second order here
      // is exactly the double charge this block exists to prevent, so settle
      // what they already paid instead.
      if (amountMatches(existing.data.gross_amount, pending.amount)) {
        try {
          await settlePaidOrder(pending, "[payment/create]");
        } catch (err) {
          console.error(`[payment/create] Could not settle already-paid order=${pending.orderId}:`, err);
        }
      }
      return NextResponse.json(
        {
          error: "already_paid",
          message: "Pembayaran Anda untuk paket ini sudah kami terima. Silakan buka dashboard untuk melihat status langganan.",
          orderId: pending.orderId,
        },
        { status: 409 },
      );
    }

    const finished = existing.ok ? closedTransactionStatus(existing.data.transaction_status) : null;
    if (finished) {
      // Midtrans is done with it, so it cannot be paid any more and there is no
      // double-charge risk in issuing a new one. Record the close on the way
      // past, so the dashboard stops showing it as waiting.
      await db.update(transactions)
        .set({ status: finished })
        .where(and(eq(transactions.id, pending.id), ne(transactions.status, "paid")))
        .catch((err) => console.error(`[payment/create] Could not mark order=${pending.orderId} ${finished}:`, err));
    } else {
      console.log(`[payment/create] Reusing pending order: company=${dbUser.companyId} order=${pending.orderId}`);
      return NextResponse.json({ token: pending.snapToken, orderId: pending.orderId, reused: true });
    }
  }

  // A timestamp is a time, not an identifier: two checkouts for the same plan in
  // the same millisecond used to produce the same order_id, and order_id is
  // unique both here (schema) and at Midtrans. The random suffix is what makes
  // it an id — the timestamp stays only because it makes an order readable at a
  // glance in the Midtrans dashboard.
  const orderId = `IB-${plan.toUpperCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  // Price is resolved server-side (promo-aware) so the client can never dictate it.
  const amount = getPlanPrice(plan);

  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    item_details: [{
      id: plan,
      price: amount,
      quantity: 1,
      name: PLAN_NAMES[plan],
    }],
    customer_details: {
      first_name: dbUser.name,
      email: dbUser.email,
    },
    callbacks: {
      finish: `${process.env.BETTER_AUTH_URL}/payment/success?plan=${plan}`,
      error: `${process.env.BETTER_AUTH_URL}/payment/failed`,
      pending: `${process.env.BETTER_AUTH_URL}/payment/pending`,
    },
  };

  let snapResponse: { token: string; redirect_url: string };
  try {
    snapResponse = await createSnapTransaction(parameter);
  } catch (err) {
    // A refusal from Midtrans, a timeout, or an unset server key. Nothing has
    // been written here yet and the customer has no token, so there is no
    // half-finished order to clean up — they can simply try again.
    console.error(`[payment/create] Could not open checkout for order=${orderId}:`, err);
    return NextResponse.json(
      { error: "checkout_failed", message: "Gagal menghubungi penyedia pembayaran. Coba lagi beberapa saat lagi." },
      { status: 502 },
    );
  }

  await db.insert(transactions).values({
    id: randomUUID(),
    companyId: dbUser.companyId,
    orderId,
    plan,
    amount: String(amount),
    status: "pending",
    snapToken: snapResponse.token,
  });

  return NextResponse.json({ token: snapResponse.token, orderId });
}
