import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  if (!company) return NextResponse.json(null);

  // Never expose raw API keys to the frontend
  const { groqApiKey, geminiApiKey, ...safe } = company;
  void groqApiKey; void geminiApiKey;
  return NextResponse.json(safe);
}
