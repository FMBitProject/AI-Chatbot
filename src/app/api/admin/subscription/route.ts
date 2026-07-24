import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getLimits } from "@/lib/plan-limits";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
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

  const limits = getLimits(company?.plan ?? "starter");

  return NextResponse.json({
    plan: company?.plan ?? "starter",
    planExpiresAt: company?.planExpiresAt ?? null,
    limits,
    history,
  });
}
