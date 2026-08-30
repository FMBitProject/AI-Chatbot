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
    // alertOps rather than a mail call of its own: it already cannot throw and
    // is bounded by a send timeout, both of which matter on a route a visitor
    // reaches without signing in.
    //
    // Its deduplication, however, protects nothing here, and an earlier comment
    // in this spot claimed otherwise. The key is the submitted address, so the
    // quiet window collapses repeats of one lead and does exactly nothing about
    // a thousand different ones — and unlike every other caller of alertOps,
    // the key on this path is chosen by whoever is filling in the form. The
    // per-IP throttle above is the first bound and the easy one to route
    // around; `budget` is the one that holds regardless of how many addresses
    // arrive from how many places.
    //
    // 20/hour is set well above a real week's leads and well below anything
    // that would matter as a mail bill. Over it, alertOps logs and does not
    // send, so nothing is lost that `npm run leads` cannot recover.
    //
    // Awaited, not fire-and-forget: a serverless function is free to freeze the
    // moment this handler returns.
    if (inserted.length > 0) {
      await alertOps({
        dedupeKey: `lead:${email.toLowerCase()}`,
        subject: `Lead baru dari landing page (${audience === "company" ? "Perusahaan" : "Individu"})`,
        details: { email: email.toLowerCase(), audience, locale },
        budget: { name: "leads", max: 20 },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[leads]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
