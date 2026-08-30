import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { landingLeads } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { isOneOf, optionalEmail, readJsonObject } from "@/lib/validate";
import { alertOps } from "@/lib/alerts";

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

  // Honeypot: a field no visitor sees or fills, rendered off-screen in the form.
  // A bot that fills every input trips it; a human never does. Reported back
  // as success so a bot that checks the response can't tell it was dropped.
  //
  // Anything but our own empty string trips it, rather than "is this a valid
  // short string". The first version asked `optionalString(body.website, 100)`,
  // which returns null for a 200-character URL and for a number — so the two
  // things a spam bot is most likely to send were the two that got through.
  // The form always posts "" for this field, so anything else is not the form.
  if (body.website !== undefined && body.website !== null && body.website !== "") {
    return NextResponse.json({ ok: true });
  }

  const email = optionalEmail(body.email);
  const audience = isOneOf(body.audience, ["company", "individual"] as const) ? body.audience : null;
  const locale = isOneOf(body.locale, ["id", "en"] as const) ? body.locale : null;
  if (!email || !audience || !locale) {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  try {
    // Lowercased so the unique index below actually holds: Postgres compares
    // text case-sensitively, so storing "Budi@X.com" verbatim lets the same
    // person through again as "budi@x.com".
    //
    // onConflictDoNothing, not an error: a repeat submit is a person clicking
    // twice or coming back a week later, and there is nothing to tell them —
    // we already have the address. Answering 200 either way also keeps this
    // from being an oracle for whether an address is already on the list.
    const inserted = await db.insert(landingLeads)
      .values({ id: randomUUID(), email: email.toLowerCase(), audience, locale })
      .onConflictDoNothing()
      .returning({ id: landingLeads.id });

    // Tell a human. Until this, a lead was written to a table nothing in the
    // application ever read — the form worked perfectly and every address it
    // collected went into a hole. Somebody who leaves their email is asking to
    // be contacted, and a follow-up a fortnight late is a follow-up nobody
    // wanted.
    //
    // Only on a real insert: `returning()` comes back empty when
    // onConflictDoNothing swallowed a duplicate, and a repeat submit is the same
    // person clicking twice, not a second lead to chase.
    //
    // alertOps is used as-is rather than a mail call of its own because it
    // already cannot throw, is bounded by a send timeout, and dedupes — all
    // three of which matter on a public endpoint. The dedupe key is the address,
    // so the quiet window can only ever suppress a duplicate of the same lead,
    // never a different person. Awaited, not fire-and-forget: a serverless
    // function is free to freeze the moment this handler returns.
    if (inserted.length > 0) {
      await alertOps({
        dedupeKey: `lead:${email.toLowerCase()}`,
        subject: `Lead baru dari landing page (${audience === "company" ? "Perusahaan" : "Individu"})`,
        details: { email: email.toLowerCase(), audience, locale },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[leads]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
