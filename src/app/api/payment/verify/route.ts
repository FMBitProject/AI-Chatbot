import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { plan } = await req.json() as { plan: "professional" | "enterprise" };
  if (!plan) return NextResponse.json({ error: "No plan" }, { status: 400 });

  // Check if there's a recent pending transaction for this plan
  const [tx] = await db.select().from(transactions)
    .where(eq(transactions.companyId, dbUser.companyId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  if (!tx || tx.plan !== plan) {
    return NextResponse.json({ error: "No matching transaction" }, { status: 404 });
  }

  // Verify with Midtrans API
  const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  const isProduction = process.env.MIDTRANS_ENV === "production";
  const baseUrl = isProduction
    ? "https://api.midtrans.com/v2"
    : "https://api.sandbox.midtrans.com/v2";

  try {
    const res = await fetch(`${baseUrl}/${tx.orderId}/status`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json() as { transaction_status: string; fraud_status?: string };

    const isSuccess =
      (data.transaction_status === "capture" && data.fraud_status === "accept") ||
      data.transaction_status === "settlement";

    if (isSuccess) {
      const planExpiresAt = new Date();
      planExpiresAt.setMonth(planExpiresAt.getMonth() + 1);
      await db.update(transactions).set({ status: "paid", paidAt: new Date() }).where(eq(transactions.id, tx.id));
      await db.update(companies).set({ plan, planExpiresAt }).where(eq(companies.id, dbUser.companyId));
      return NextResponse.json({ ok: true, upgraded: true });
    }

    if (data.transaction_status === "pending") {
      return NextResponse.json({ ok: true, upgraded: false, status: "pending" });
    }

    return NextResponse.json({ ok: true, upgraded: false, status: data.transaction_status });
  } catch {
    return NextResponse.json({ error: "Midtrans API error" }, { status: 500 });
  }
}
