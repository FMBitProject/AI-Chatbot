// Renames one company.
//
// Nothing else in the app can do this. `companies.name` is written once, by
// registration, and never again — there is no rename screen in the admin
// dashboard and no endpoint behind one (`PATCH /api/admin/company` handles BYOK
// keys only). So this script is not a convenience wrapper around an existing
// feature; it is the only way a workspace name is ever corrected after signup.
//
// Operator-level for the same reason as grant-plan.mjs: there is no
// platform-owner role in this codebase (`users.role` is `admin | employee`,
// where "admin" means the *customer's own* admin). Shipping a rename screen
// would mean either a button every tenant can press on itself, or inventing a
// super-admin role and defending that escalation path against every future auth
// bug. A command that needs the production connection string is already scoped
// to whoever has it.
//
// Usage:
//   node scripts/rename-company.mjs <company> --to "RS Cakrawala Medika"
//   ...defaults to a dry run; add --yes to actually write.
//
// The company is matched by id, by exact name, or by the email of any user
// belonging to it — whichever you happen to have to hand.
//
// Only `companies.name` moves. Documents, chunks, users and the AI persona's
// greeting are all separate rows: a greeting that names the old company keeps
// naming it until someone edits it in Admin -> AI Persona.
//
// Run it with the OWNER connection string, not the app_rls one: `companies` is
// not an RLS table, and the owner URL is what .env.local already holds.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

// Mirrors LIMITS.name in src/lib/validate.ts, which is what registration
// applies to this same column. Duplicated rather than imported for the reason
// AGENTS.md gives: this is a plain .mjs operator script run straight by node,
// with no `@/` alias to resolve. If LIMITS.name moves, move this with it.
const NAME_MAX = 100;
// The app's own floor is 1 (optionalString rejects only the empty string). 2
// here, deliberately stricter: every real workspace name has at least two
// characters, so a single character reaching this script is far more likely to
// be a mangled flag than an intended rename.
const NAME_MIN = 2;

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

const USAGE = 'Usage: node scripts/rename-company.mjs <company-name-email-or-id> --to "New Name" [--yes]';

// Unknown flags stop the run rather than being ignored. grant-plan.mjs, the
// script an operator reaches for right before this one, *has* a --dry-run flag;
// here a dry run is the default and --yes is what writes. Silently ignoring an
// unknown flag would therefore mean `--yes --dry-run` — a very natural thing to
// type when being careful — writes to production anyway.
const KNOWN_FLAGS = new Set(["--to", "--yes", "--dry-run"]);
const unknownFlags = args.filter((a, i) => !consumed.has(i) && a.startsWith("--") && !KNOWN_FLAGS.has(a));
if (unknownFlags.length) {
  console.error(`Unknown flag(s): ${unknownFlags.join(", ")}`);
  console.error(USAGE);
  process.exit(1);
}

const yes = args.includes("--yes") && !args.includes("--dry-run");
// TODO: [MINOR] extra positional arguments are dropped silently — an unquoted
// company name ("PT. Maju Bersama" as three words) matches on the first word
// only. Harmless today because the match then fails loudly, but it should be
// rejected explicitly.
const identifier = args.filter((a, i) => !consumed.has(i) && !a.startsWith("--"))[0];

if (!identifier || newName === undefined) {
  console.error(USAGE);
  process.exit(1);
}

// TODO: [MINOR] control characters are not rejected — `--to $'RS X\nADMIN'`
// survives .trim() and lands in the admin header and the RAG prompt.
const trimmed = newName.trim();
if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
  console.error(`--to must be between ${NAME_MIN} and ${NAME_MAX} characters (got ${trimmed.length}).`);
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// `documents` is deliberately not counted here, however useful the number would
// be on a confirmation line. It is FORCE ROW LEVEL SECURITY (see
// drizzle/0004_row_level_security.sql), and this is a stateless neon-http
// connection: there is no transaction to hold a set_config('app.company_id'),
// so the policy would see no tenant and the count would come back silently
// zero. A confirmation prompt that prints "0 documents" for an account holding
// three is worse than one that prints nothing — it invites the operator to
// conclude they matched the wrong company, or that the tenant is empty and safe
// to rename. `users` carries no RLS policy, which is why grant-plan.mjs counts
// that and nothing else.
const matches = await sql.query(
  `select c.id, c.name, c.plan, c.account_type,
          (select count(*) from users u where u.company_id = c.id) as user_count
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
// Names are not unique in the schema across account types, so an ambiguous
// match must stop rather than pick one — renaming the wrong tenant is this
// script's worst outcome.
if (matches.length > 1) {
  console.error(`"${identifier}" matches ${matches.length} companies — re-run with the company id:`);
  for (const m of matches) console.error(`  ${m.id}  ${m.name}`);
  process.exit(1);
}

const company = matches[0];

console.log(`Company : ${company.name} (${company.id})`);
console.log(`Type    : ${company.account_type}  ·  Plan: ${company.plan}`);
console.log(`Users   : ${company.user_count}`);
console.log(`Rename  : "${company.name}"  ->  "${trimmed}"`);

if (company.name === trimmed) {
  console.log("\nAlready named that. No change.");
  process.exit(0);
}
if (!yes) {
  console.log("\nDry run. Re-run with --yes to write this change.");
  process.exit(0);
}

// `and name = $3` makes this an optimistic lock, and RETURNING is what proves
// the write happened. neon-http is stateless, so the SELECT above and this
// UPDATE are two separate round trips with no transaction around them: without
// both halves, a company renamed from the dashboard or deleted in between would
// leave this script printing "Renamed." over a write that affected no rows.
let renamed;
try {
  [renamed] = await sql.query(
    `update companies set name = $1 where id = $2 and name = $3 returning name`,
    [trimmed, company.id, company.name],
  );
} catch (error) {
  // Company names are unique among *organisation* accounts and not among
  // individual ones (companies_name_unique_company is a partial index over
  // account_type = 'company'). Named here because the raw Postgres text says
  // only that a unique constraint was violated, in the middle of a production
  // write, with no indication of which company already holds the name.
  const duplicate = error?.code === "23505"
    || /companies_name_unique_company|duplicate key/i.test(String(error?.message ?? ""));
  if (duplicate) {
    console.error(`\nNot renamed: another company account is already named "${trimmed}".`);
    console.error("Organisation names must be unique; personal (individual) names need not be.");
    process.exit(1);
  }
  console.error("\nNot renamed: the database rejected the update.");
  console.error(error);
  process.exit(1);
}

if (!renamed) {
  console.error(`\nNothing was written: "${company.name}" changed or was removed between the check above and the update.`);
  console.error("Re-run the command to see the company's current state.");
  process.exit(1);
}

console.log(`\nRenamed to "${renamed.name}". Admin -> AI Persona still holds the old greeting if it named "${company.name}".`);
