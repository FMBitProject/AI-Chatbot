// Renames one company. Operator-level, same reasoning as grant-plan.mjs: there
// is no platform-owner role in this codebase (`users.role` is `admin |
// employee`, where "admin" is the *customer's own* admin), so a rename screen
// would either be a button every tenant can press on itself or a new
// super-admin escalation path to defend. A command that needs the production
// connection string is already scoped to whoever has it.
//
// The customer's own admin can already rename their company from the dashboard.
// This exists for the accounts we run ourselves — the demo tenant behind the
// landing-page screenshots, for one.
//
// Usage:
//   node scripts/rename-company.mjs <company> --to "RS Cakrawala Medika"
//   ...defaults to a dry run; add --yes to actually write.
//
// The company is matched by id, by exact name, or by the email of any admin
// user belonging to it — whichever you happen to have to hand.
//
// Only `companies.name` moves. Documents, chunks, users, and the AI persona's
// greeting are all separate rows: a greeting that names the old company keeps
// naming it until someone edits it in Admin → AI Persona.
//
// Run it with the OWNER connection string, not the app_rls one: `companies` is
// not an RLS table, and the owner URL is what .env.local already holds.
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
const consumed = new Set();

// Same shape as grant-plan.mjs, and for the same reason: the value of a valued
// flag must be consumed before the positional identifier is picked, or
// `--to "RS X" acme` and `--to acme` become indistinguishable. A trailing
// `--to` stops the run instead of renaming a company to `undefined`.
function flagValue(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`${name} needs a value.`);
    process.exit(1);
  }
  consumed.add(i);
  consumed.add(i + 1);
  return value;
}

const newName = flagValue("--to");
const yes = args.includes("--yes");
const identifier = args.filter((a, i) => !consumed.has(i) && !a.startsWith("--"))[0];

const USAGE = 'Usage: node scripts/rename-company.mjs <company-name-email-or-id> --to "New Name" [--yes]';

if (!identifier || newName === undefined) {
  console.error(USAGE);
  process.exit(1);
}
// The dashboard's own rename applies the same floor; a script that skipped it
// could leave a tenant with a name no form would accept back.
const trimmed = newName.trim();
if (trimmed.length < 2 || trimmed.length > 100) {
  console.error(`--to must be between 2 and 100 characters (got ${trimmed.length}).`);
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const matches = await sql.query(
  `select c.id, c.name, c.plan, c.account_type,
          (select count(*) from users u where u.company_id = c.id) as user_count,
          (select count(*) from documents d where d.company_id = c.id) as doc_count
     from companies c
    where c.id = $1
       or lower(c.name) = lower($1)
       or exists (select 1 from users u
                   where u.company_id = c.id and lower(u.email) = lower($1))`,
  [identifier],
);

if (matches.length === 0) {
  console.error(`No company found matching "${identifier}".`);
  process.exit(1);
}
// Names are not unique in the schema, so an ambiguous match must stop rather
// than pick one — renaming the wrong tenant is this script's worst outcome.
if (matches.length > 1) {
  console.error(`"${identifier}" matches ${matches.length} companies — re-run with the company id:`);
  for (const m of matches) console.error(`  ${m.id}  ${m.name}`);
  process.exit(1);
}

const company = matches[0];

console.log(`Company : ${company.name} (${company.id})`);
console.log(`Type    : ${company.account_type}  ·  Plan: ${company.plan}`);
console.log(`Contents: ${company.user_count} users, ${company.doc_count} documents`);
console.log(`Rename  : "${company.name}"  ->  "${trimmed}"`);

if (company.name === trimmed) {
  console.log("\nAlready named that. No change.");
  process.exit(0);
}
if (!yes) {
  console.log("\nDry run. Re-run with --yes to write this change.");
  process.exit(0);
}

await sql.query(`update companies set name = $1 where id = $2`, [trimmed, company.id]);
console.log(`\nRenamed. Admin -> AI Persona still holds the old greeting if it named "${company.name}".`);
