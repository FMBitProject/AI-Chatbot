import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { resolvePlan } from "@/lib/subscription";

// Matches the reuse window in payment/create and the default Midtrans
// transaction lifetime: past it the Snap token is dead.
const RESUMABLE_FOR_MS = 24 * 60 * 60 * 1000;

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
  const rows = await db.select({
    id: transactions.id,
    orderId: transactions.orderId,
    plan: transactions.plan,
    amount: transactions.amount,
    status: transactions.status,
    snapToken: transactions.snapToken,
    createdAt: transactions.createdAt,
    paidAt: transactions.paidAt,
  }).from(transactions)
    .where(eq(transactions.companyId, dbUser.companyId))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  // The dashboard's "lanjutkan pembayaran" button renders only when a row has a
  // snapToken, and this query never selected the column — so the button has
  // never appeared, and a customer who closed the Snap popup had no way back to
  // their order except starting another one at /pricing. Two live orders for one
  // month is how a customer ends up paying for it twice.
  //
  // Only sent for orders that can still be paid: a Snap token dies with its
  // transaction, and a button that opens a dead popup is worse than no button.
  const history = rows.map(({ snapToken, ...tx }) => ({
    ...tx,
    snapToken:
      tx.status === "pending" && Date.now() - tx.createdAt.getTime() < RESUMABLE_FOR_MS
        ? snapToken
        : null,
  }));

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
