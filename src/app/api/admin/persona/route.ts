import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  return NextResponse.json({ aiName: company?.aiName, aiGreeting: company?.aiGreeting, aiPersonality: company?.aiPersonality });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { aiName, aiGreeting, aiPersonality } = await req.json() as {
    aiName?: string;
    aiGreeting?: string;
    aiPersonality?: string;
  };

  await db.update(companies)
    .set({ aiName: aiName || "IntelliBase AI", aiGreeting: aiGreeting || null, aiPersonality: aiPersonality || null })
    .where(eq(companies.id, dbUser.companyId));

  return NextResponse.json({ ok: true });
}
