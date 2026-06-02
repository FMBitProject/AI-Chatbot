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
  return NextResponse.json({
    aiName: company?.aiName,
    aiGreeting: company?.aiGreeting,
    aiPersonality: company?.aiPersonality,
    hasGroqApiKey: !!company?.groqApiKey,
    hasGeminiApiKey: !!company?.geminiApiKey,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { aiName, aiGreeting, aiPersonality, groqApiKey, geminiApiKey } = await req.json() as {
    aiName?: string;
    aiGreeting?: string;
    aiPersonality?: string;
    groqApiKey?: string;
    geminiApiKey?: string;
  };

  const updateData: Partial<typeof companies.$inferInsert> = {
    aiName: aiName || "IntelliBase AI",
    aiGreeting: aiGreeting || null,
    aiPersonality: aiPersonality || null,
  };
  // Only update keys if a new non-empty value is provided; empty string clears the key
  if (groqApiKey !== undefined) updateData.groqApiKey = groqApiKey || null;
  if (geminiApiKey !== undefined) updateData.geminiApiKey = geminiApiKey || null;

  await db.update(companies).set(updateData).where(eq(companies.id, dbUser.companyId));

  return NextResponse.json({ ok: true });
}
