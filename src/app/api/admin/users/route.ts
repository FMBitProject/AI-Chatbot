import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getLimits } from "@/lib/plan-limits";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await db.select().from(users).where(eq(users.companyId, dbUser.companyId));
  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Enforce plan limits
  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  const limits = getLimits(company?.plan ?? "starter");
  const [{ count: empCount }] = await db.select({ count: count() }).from(users).where(eq(users.companyId, dbUser.companyId));
  if (empCount >= limits.maxEmployees) {
    return NextResponse.json({
      error: `Batas karyawan paket ${company?.plan ?? "Starter"} sudah tercapai (${limits.maxEmployees} karyawan). Upgrade paket untuk menambah lebih banyak.`,
    }, { status: 403 });
  }

  const { name, email, password, department } = await req.json() as {
    name: string;
    email: string;
    password: string;
    department?: string;
  };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
  }

  await auth.api.signUpEmail({ body: { name, email, password } });

  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (created) {
    await db.update(users)
      .set({ companyId: dbUser.companyId, role: "employee", department: department || null })
      .where(eq(users.id, created.id));

    const [updated] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Gagal membuat user." }, { status: 500 });
}
