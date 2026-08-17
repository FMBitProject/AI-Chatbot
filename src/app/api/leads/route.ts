import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { landingLeads } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { isOneOf, LIMITS, optionalEmail, optionalString, readJsonObject } from "@/lib/validate";

// Public endpoint for a landing-page visitor not ready to sign up — throttle
// per IP so it can't be used to spam the leads table or as an email oracle.
const LEADS_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const limit = consumeRateLimit(`leads:${getClientIp(req)}`, LEADS_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }

  // Honeypot: a field no visitor sees or fills, styled off-screen in the form.
  // A bot that fills every input trips it; a human never does. Reported back
  // as success so a bot that checks the response can't tell it was dropped.
  if (optionalString(body.website, LIMITS.name)) {
    return NextResponse.json({ ok: true });
  }

  const email = optionalEmail(body.email);
  const audience = isOneOf(body.audience, ["company", "individual"] as const) ? body.audience : null;
  const locale = isOneOf(body.locale, ["id", "en"] as const) ? body.locale : null;
  if (!email || !audience || !locale) {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  try {
    await db.insert(landingLeads).values({ id: randomUUID(), email, audience, locale });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[leads]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
