import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolvePlan } from "@/lib/subscription";

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

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId!)).limit(1);
  if (!companyRow) return NextResponse.json(null);

  // `plan` is the plan in force right now, so the dashboard gates on exactly
  // what the server enforces; `purchasedPlan` is only for messaging.
  const { subscription } = await resolvePlan(companyRow);
  const { groqApiKey, geminiApiKey, ...safe } = companyRow;
  return NextResponse.json({
    ...safe,
    plan: subscription.plan,
    purchasedPlan: subscription.purchasedPlan,
    subscriptionStatus: subscription.status,
    hasGroqKey: !!groqApiKey,
    hasGeminiKey: !!geminiApiKey,
  });
}

export async function PATCH(req: NextRequest) {
  const dbUser = await getAuthedAdmin(req);
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId!)).limit(1);
  if (!companyRow) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const body = await req.json() as { groqApiKey?: string | null; geminiApiKey?: string | null };
  const update: { groqApiKey?: string | null; geminiApiKey?: string | null } = {};
  if (body.groqApiKey !== undefined) update.groqApiKey = body.groqApiKey || null;
  if (body.geminiApiKey !== undefined) update.geminiApiKey = body.geminiApiKey || null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });

  // Storing a key is the Enterprise feature (judged on the plan in force right
  // now, so a lapsed Enterprise cannot keep configuring dedicated capacity).
  // REMOVING a key is always allowed, whatever the plan: it is the customer's
  // own credential, and a company whose key was revoked upstream must be able
  // to clear it themselves — otherwise their chat stays broken until we step in.
  const isRemovalOnly = Object.values(update).every((v) => v === null);
  if (!isRemovalOnly) {
    const { subscription } = await resolvePlan(companyRow);
    if (subscription.plan !== "enterprise") {
      return NextResponse.json({ error: "Fitur ini hanya tersedia untuk paket Enterprise." }, { status: 403 });
    }
  }

  await db.update(companies).set(update).where(eq(companies.id, companyRow.id));

  const [updated] = await db.select().from(companies).where(eq(companies.id, companyRow.id)).limit(1);
  return NextResponse.json({ hasGroqKey: !!updated.groqApiKey, hasGeminiKey: !!updated.geminiApiKey });
}
