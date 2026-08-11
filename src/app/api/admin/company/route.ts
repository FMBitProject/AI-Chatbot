import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolvePlan } from "@/lib/subscription";
import { LIMITS, readJsonObject } from "@/lib/validate";

// This file used to carry its own getAuthedAdmin() — the only route that had
// bothered to factor the check out. It is gone in favour of the shared guard,
// which keeps the distinction it was written for: "not signed in" (401) and
// "signed in but not an admin" (403) are different answers, and the dashboard
// reads the difference to choose between /login and /chat.

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, guard.user.companyId)).limit(1);
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
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, guard.user.companyId)).limit(1);
  if (!companyRow) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  const update: { groqApiKey?: string | null; geminiApiKey?: string | null } = {};
  for (const field of ["groqApiKey", "geminiApiKey"] as const) {
    // Three distinct meanings, and the difference matters: absent leaves the key
    // alone, null (or blank) removes it, a string replaces it. Collapsing absent
    // and null would wipe the key the admin did not mention.
    const value = body[field];
    if (value === undefined) continue;
    if (value === null) {
      update[field] = null;
      continue;
    }
    // Anything else that is not a string used to reach `.trim()` and throw a
    // TypeError, which left the handler as a 500 — our outage, for their
    // malformed request. The length cap is the other half: a provider key is
    // ~200 characters, and nothing stops a client posting a megabyte otherwise.
    if (typeof value !== "string" || value.length > LIMITS.apiKey) {
      return NextResponse.json({ error: "Format API key tidak valid." }, { status: 400 });
    }
    // Trimmed, and whitespace-only counts as removal. Keys are pasted from a
    // provider console, which is how a trailing newline gets in — and the
    // embedding client treats any non-empty string as a real key, so an untrimmed
    // one never falls back to the platform account — it is simply rejected
    // upstream. Since these keys now also index uploaded documents, that turns a
    // stray newline into every upload failing.
    update[field] = value.trim() || null;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });

  // Storing a key is the Enterprise-and-above feature (judged on the plan in
  // force right now, so a lapsed Enterprise cannot keep configuring dedicated
  // capacity). Custom counts too — an uncapped plan is only viable when the
  // customer's own key pays for the usage, so it must be able to set one.
  // REMOVING a key is always allowed, whatever the plan: it is the customer's
  // own credential, and a company whose key was revoked upstream must be able
  // to clear it themselves — otherwise their chat stays broken until we step in.
  const isRemovalOnly = Object.values(update).every((v) => v === null);
  if (!isRemovalOnly) {
    const { subscription } = await resolvePlan(companyRow);
    if (subscription.plan !== "enterprise" && subscription.plan !== "custom") {
      return NextResponse.json({ error: "Fitur ini hanya tersedia untuk paket Enterprise." }, { status: 403 });
    }
  }

  await db.update(companies).set(update).where(eq(companies.id, companyRow.id));

  const [updated] = await db.select().from(companies).where(eq(companies.id, companyRow.id)).limit(1);
  return NextResponse.json({ hasGroqKey: !!updated.groqApiKey, hasGeminiKey: !!updated.geminiApiKey });
}
