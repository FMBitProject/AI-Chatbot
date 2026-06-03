import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function getAuthedAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return null;
  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) return null;
  return dbUser;
}

export async function GET(req: NextRequest) {
  const dbUser = await getAuthedAdmin(req);
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId!)).limit(1);
  if (!company) return NextResponse.json(null);

  const { groqApiKey, geminiApiKey, ...safe } = company;
  return NextResponse.json({ ...safe, hasGroqKey: !!groqApiKey, hasGeminiKey: !!geminiApiKey });
}

export async function PATCH(req: NextRequest) {
  const dbUser = await getAuthedAdmin(req);
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId!)).limit(1);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (company.plan !== "enterprise") {
    return NextResponse.json({ error: "Fitur ini hanya tersedia untuk paket Enterprise." }, { status: 403 });
  }

  const body = await req.json() as { groqApiKey?: string | null; geminiApiKey?: string | null };
  const update: { groqApiKey?: string | null; geminiApiKey?: string | null } = {};
  if (body.groqApiKey !== undefined) update.groqApiKey = body.groqApiKey || null;
  if (body.geminiApiKey !== undefined) update.geminiApiKey = body.geminiApiKey || null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });

  await db.update(companies).set(update).where(eq(companies.id, company.id));

  const [updated] = await db.select().from(companies).where(eq(companies.id, company.id)).limit(1);
  return NextResponse.json({ hasGroqKey: !!updated.groqApiKey, hasGeminiKey: !!updated.geminiApiKey });
}
