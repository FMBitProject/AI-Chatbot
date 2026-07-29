import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { resolvePlan } from "@/lib/subscription";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admin-only, like every other /api/admin route: the response carries the
  // company's billing history — order ids, amounts, payment dates — which an
  // ordinary employee has no reason to see. RenewalBanner calls this too and
  // simply renders nothing on a non-2xx, so a non-admin loses a banner about a
  // subscription they cannot renew anyway.
  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  const { subscription, limits } = await resolvePlan(companyRow);
  const history = await db.select({
    id: transactions.id,
    orderId: transactions.orderId,
    plan: transactions.plan,
    amount: transactions.amount,
    status: transactions.status,
    createdAt: transactions.createdAt,
    paidAt: transactions.paidAt,
  }).from(transactions)
    .where(eq(transactions.companyId, dbUser.companyId))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  return NextResponse.json({
    // plan = what applies right now (starter once the grace period is over);
    // purchasedPlan + status let the UI explain why.
    plan: subscription.plan,
    purchasedPlan: subscription.purchasedPlan,
    status: subscription.status,
    planExpiresAt: subscription.expiresAt,
    graceEndsAt: subscription.graceEndsAt,
    daysUntilExpiry: subscription.daysUntilExpiry,
    limits,
    history,
  });
}
