import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { companies, transactions } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { resolvePlan } from "@/lib/subscription";

// Matches the reuse window in payment/create and the default Midtrans
// transaction lifetime: past it the Snap token is dead.
const RESUMABLE_FOR_HOURS = 24;

export async function GET(req: NextRequest) {
  // Admin-only, like every other /api/admin route: the response carries the
  // company's billing history — order ids, amounts, payment dates — which an
  // ordinary employee has no reason to see. RenewalBanner calls this too and
  // simply renders nothing on a non-2xx, so a non-admin loses a banner about a
  // subscription they cannot renew anyway.
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const { subscription, limits } = await resolvePlan(companyRow);
  const rows = await db.select({
    id: transactions.id,
    orderId: transactions.orderId,
    plan: transactions.plan,
    amount: transactions.amount,
    status: transactions.status,
    // The token, but only while the order can still be paid — decided by
    // Postgres, against the same clock that wrote created_at. Doing the
    // subtraction in JS compares a zone-less timestamp (which the driver hands
    // back as local time) against a local Date, and silently shifts the window
    // by the server's offset anywhere but UTC.
    //
    // Emitted as the token-or-null rather than as a boolean the caller then
    // applies: a boolean has to survive the trip back as a real `true`/`false`,
    // and if it ever arrived as the string "f" it would be truthy — handing the
    // dashboard a dead token to open. There is no wrong way to read null.
    snapToken: sql<string | null>`CASE WHEN ${transactions.status} = 'pending' AND ${transactions.createdAt} > now() - ${sql.raw(`interval '${RESUMABLE_FOR_HOURS} hours'`)} THEN ${transactions.snapToken} ELSE NULL END`,
    createdAt: transactions.createdAt,
    paidAt: transactions.paidAt,
  }).from(transactions)
    .where(eq(transactions.companyId, companyId))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  // The dashboard's "lanjutkan pembayaran" button renders only when a row
  // carries a snapToken. The column used to be missing from this query
  // altogether, so the button never appeared and a customer who closed the Snap
  // popup had no way back to their order except starting another one at
  // /pricing — two live orders for one month is how a customer pays for it
  // twice. It is selected now, but only for orders that can still be paid: a
  // Snap token dies with its transaction, and a button that opens a dead popup
  // is worse than no button.
  const history = rows;

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
