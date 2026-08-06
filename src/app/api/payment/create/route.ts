import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSnapTransaction } from "@/lib/midtrans";
import { getPlanPrice, PLAN_NAMES, isPurchasablePlan, planRank, planRankInForce } from "@/lib/pricing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

// Each accepted call opens a real transaction at Midtrans and writes a row here,
// so a stuck retry loop or a stolen session should not be able to run up either
// without limit. Well above what a customer clicking "Bayar" can reach.
const CREATE_LIMIT = { max: 5, windowMs: 60 * 1000 };

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
