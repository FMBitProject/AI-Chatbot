// Prints the landing-page leads — the email addresses left by visitors who were
// not ready to sign up.
//
//   node scripts/list-leads.mjs                 # newest first
//   node scripts/list-leads.mjs --csv           # for a spreadsheet or a mail merge
//   node scripts/list-leads.mjs --since 2026-08-01
//   node scripts/list-leads.mjs --audience company
//
// Why a script and not an admin screen: `landing_leads` is the only table in
// this database that belongs to us rather than to a tenant. Every screen in
// /admin is scoped to the signed-in person's company by construction, and a page
// that deliberately is not would be a permanently exposed list of every prospect
// we have, defended by one role check. The founder reads this a few times a
// month from a terminal that already has the production connection string.
//
// POST /api/leads now emails ALERT_EMAIL the moment a lead arrives, so this is
// for the backlog and for exports, not for finding out.
//
// Run it with the OWNER connection string — the same one .env.local already
// holds for migrations. `landing_leads` carries no RLS policy (it has no
// company_id to key one on), so the app_rls role would read it fine too; the
// owner URL is simply what is to hand.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

function fromEnvFile(key) {
  try {
    const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
    }
  } catch {}
  return undefined;
}

const DATABASE_URL = process.env.DATABASE_URL || fromEnvFile("DATABASE_URL");
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const args = process.argv.slice(2);
const csv = args.includes("--csv");

// Refuses a flag with nothing after it, rather than reading undefined and
// carrying on. Written the naive way, `--since` as the last argument produced
// no value, skipped the validation below (which only runs when the value is
// truthy) and printed the whole table — an unfiltered list presented as a
// filtered one, which is the sort of wrong answer nobody double-checks.
function flagValue(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} needs a value, e.g. ${name === "--since" ? "--since 2026-08-01" : "--audience company"}`);
    process.exit(1);
  }
  return value;
}

const since = flagValue("--since");
const audience = flagValue("--audience");

if (since && Number.isNaN(Date.parse(since))) {
  console.error(`--since expects a date like 2026-08-01, got "${since}"`);
  process.exit(1);
}
if (audience && !["company", "individual"].includes(audience)) {
  console.error(`--audience expects "company" or "individual", got "${audience}"`);
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Parameterised rather than interpolated. Both values come from a flag typed by
// whoever runs this, which is about as trusted as input gets — but a query built
// by string concatenation is a habit, and the habit is what eventually meets a
// value from somewhere else.
const rows = await sql`
  SELECT email, audience, locale, created_at
  FROM landing_leads
  WHERE (${since ?? null}::timestamp IS NULL OR created_at >= ${since ?? null}::timestamp)
    AND (${audience ?? null}::text IS NULL OR audience = ${audience ?? null}::text)
  ORDER BY created_at DESC
`;

if (rows.length === 0) {
  console.log(since || audience ? "No leads match that filter." : "No leads yet.");
  process.exit(0);
}

if (csv) {
  // Quoted and doubled-up, because an address is free text until it is in the
  // table: the form validates the shape, not the absence of a comma.
  console.log("email,audience,locale,created_at");
  for (const r of rows) {
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    console.log([r.email, r.audience, r.locale, r.created_at.toISOString()].map(cell).join(","));
  }
  process.exit(0);
}

const width = Math.max(...rows.map((r) => r.email.length));
for (const r of rows) {
  const when = r.created_at.toISOString().slice(0, 10);
  console.log(`${when}  ${r.email.padEnd(width)}  ${r.audience.padEnd(10)} ${r.locale}`);
}

const companies = rows.filter((r) => r.audience === "company").length;
console.log(`\n${rows.length} lead(s) — ${companies} perusahaan, ${rows.length - companies} individu`);
