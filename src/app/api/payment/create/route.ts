import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSnap } from "@/lib/midtrans";
import { getPlanPrice, PLAN_NAMES, isPurchasablePlan, planRank, planRankInForce } from "@/lib/pricing";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { plan } = await req.json() as { plan: unknown };
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

  const orderId = `IB-${plan.toUpperCase()}-${Date.now()}`;
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

  const snapResponse = await getSnap().createTransaction(parameter) as { token: string; redirect_url: string };

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
