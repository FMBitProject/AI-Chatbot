import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolvePlan } from "@/lib/subscription";
import { LIMITS, readJsonObject } from "@/lib/validate";
import { encryptProviderKey, type ByokField } from "@/lib/byok";
import type { Plan } from "@/lib/plan-limits";

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

  // Named fields, not `{ groqApiKey, geminiApiKey, ...rest }`.
  //
  // Stripping the two credentials and shipping whatever else the row happens to
  // hold is opt-out security: it protects the columns someone thought about on
  // the day they wrote it, and nothing added afterwards. `account_type` proved
  // the point — it was added for individual accounts and arrived in the browser
  // without anyone deciding it should. Harmless that time, which is exactly why
  // it went unnoticed; the next column may not be.
  //
  // Same rule the guards already apply to `users` (see SELECTED in
  // @/lib/auth-guard, and its note about the twoFactorSecret column that reached
  // the admin's browser by this very route). The list is short because only two
  // callers read this endpoint: the dashboard shell needs name, plan and account
  // type, the Langganan tab needs the two key flags. Adding a field here should
  // mean some caller asked for it.
  return NextResponse.json({
    name: companyRow.name,
    accountType: companyRow.accountType,
    plan: subscription.plan,
    purchasedPlan: subscription.purchasedPlan,
    subscriptionStatus: subscription.status,
    // Booleans, never the keys: the UI only ever needs to know whether one is
    // set, and the plaintext key has no business leaving the server.
    hasGroqKey: !!companyRow.groqApiKey,
    hasGeminiKey: !!companyRow.geminiApiKey,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, guard.user.companyId)).limit(1);
  if (!companyRow) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  // Parsed to PLAINTEXT first, and encrypted further down only once the plan
  // gate has passed. The order matters twice over: encrypting before the gate
  // burned crypto on a request that was about to be refused, and — because
  // encrypting is the one step that can fail on a missing BYOK_SECRET_KEY — it
  // turned "your plan does not include BYOK" into an unexplained 500 whenever
  // that variable was not set.
  const parsed: { groqApiKey?: string | null; geminiApiKey?: string | null } = {};
  for (const field of ["groqApiKey", "geminiApiKey"] as const) {
    // Three distinct meanings, and the difference matters: absent leaves the key
    // alone, null (or blank) removes it, a string replaces it. Collapsing absent
    // and null would wipe the key the admin did not mention.
    const value = body[field];
    if (value === undefined) continue;
    if (value === null) {
      parsed[field] = null;
      continue;
    }
    // Anything else that is not a string used to reach `.trim()` and throw a
    // TypeError, which left the handler as a 500 — our outage, for their
    // malformed request. The length cap is the other half: a provider key is
    // ~200 characters, and nothing stops a client posting a megabyte otherwise.
    // Measured on the plaintext, which is the only place it means anything: the
    // ciphertext is ~40% longer plus a fixed header, and capping *that* would be
    // capping our own encoding rather than their input.
    if (typeof value !== "string" || value.length > LIMITS.apiKey) {
      return NextResponse.json({ error: "Format API key tidak valid." }, { status: 400 });
    }
    // Trimmed, and whitespace-only counts as removal. Keys are pasted from a
    // provider console, which is how a trailing newline gets in — and the
    // embedding client treats any non-empty string as a real key, so an untrimmed
    // one never falls back to the platform account — it is simply rejected
    // upstream. Since these keys now also index uploaded documents, that turns a
    // stray newline into every upload failing.
    //
    // Trim before encrypting, never after: the ciphertext is opaque, so a newline
    // sealed inside it survives every later check and only surfaces as a 401 from
    // the provider.
    const trimmed = value.trim();
    parsed[field] = trimmed || null;
  }
  if (Object.keys(parsed).length === 0) return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });

  // Storing a key is a paid-plan feature, judged on the plan in force right now
  // so a lapsed subscription cannot keep configuring dedicated capacity.
  //
  // Professional was added to this list deliberately, and it does NOT come with
  // a quota change: BYOK is sold as data residency ("your documents are embedded
  // and answered inside your own provider account"), not as a way around the
  // plan's question limits. Custom is the one place the two are linked — an
  // uncapped plan is only viable when the customer's key pays per question.
  //
  // REMOVING a key is always allowed, whatever the plan: it is the customer's
  // own credential, and a company whose key was revoked upstream must be able
  // to clear it themselves — otherwise their chat stays broken until we step in.
  // This is also what keeps a downgrade recoverable: a company that drops to
  // Starter can still delete the key it can no longer edit. Removal also never
  // reaches the encryption below, so clearing a key still works when the master
  // key is the very thing that is broken.
  //
  // Typed as Plan[] rather than string[] on purpose: the next plan added to
  // PLAN_LIMITS then has to be considered here instead of silently defaulting to
  // "no BYOK". The admin header once carried a hand-written plan union and
  // rendered a Custom account as "Free" for exactly this reason.
  // `personal` is on this list even though it is the smallest paid tier, and for
  // the same reason as the rest: BYOK is sold as data residency, not capacity.
  // The individual buying it is often the most privacy-sensitive user there is —
  // a solo practitioner whose uploads are their own case notes — and telling
  // them their documents can only stay inside their own provider account if they
  // buy a fifty-seat team plan would be selling the wrong thing.
  const BYOK_PLANS: Plan[] = ["personal", "professional", "enterprise", "custom"];
  const isRemovalOnly = Object.values(parsed).every((v) => v === null);
  if (!isRemovalOnly) {
    const { subscription } = await resolvePlan(companyRow);
    if (!BYOK_PLANS.includes(subscription.plan)) {
      return NextResponse.json(
        { error: "Fitur ini hanya tersedia untuk paket Professional ke atas." },
        { status: 403 },
      );
    }
  }

  // Encryption is the last thing before the write, and the only step here that
  // depends on the environment rather than on the request. Caught rather than
  // left to become a bare 500, because the one way it fails in practice is a
  // deploy that forgot BYOK_SECRET_KEY — and the admin staring at the dialog
  // needs to be told it is our configuration, not their key.
  const update: { groqApiKey?: string | null; geminiApiKey?: string | null } = {};
  try {
    for (const [field, plaintext] of Object.entries(parsed) as [ByokField, string | null][]) {
      update[field] = plaintext === null ? null : encryptProviderKey(plaintext, companyRow.id, field);
    }
  } catch (error) {
    console.error("[admin/company] Failed to encrypt provider key:", error);
    return NextResponse.json(
      { error: "Konfigurasi enkripsi server belum lengkap, key belum tersimpan. Hubungi dukungan." },
      { status: 500 },
    );
  }

  await db.update(companies).set(update).where(eq(companies.id, companyRow.id));

  const [updated] = await db.select().from(companies).where(eq(companies.id, companyRow.id)).limit(1);
  return NextResponse.json({ hasGroqKey: !!updated.groqApiKey, hasGeminiKey: !!updated.geminiApiKey });
}
