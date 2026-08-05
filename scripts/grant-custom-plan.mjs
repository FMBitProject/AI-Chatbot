// Puts one company on the `custom` plan — the unlimited tier that has no price
// and no checkout, granted by hand after terms are agreed.
//
// Why a script rather than an admin screen: this runs at most a handful of
// times a year, and every one of those times is a signed agreement rather than
// a click. A UI for it would be a permanently exposed "make this account
// unlimited" button that has to be defended against every future auth bug, in
// exchange for saving a command. If custom deals ever become routine, build the
// screen then.
//
//   DATABASE_URL=<owner-url> node scripts/grant-custom-plan.mjs <company-email-or-id>
//   DATABASE_URL=<owner-url> node scripts/grant-custom-plan.mjs <company> --revert professional
//   ...add --dry-run to print the match and the intended change without writing.
//
// The company is matched by id, by exact name, or by the email of any admin
// user belonging to it — whichever you happen to have to hand.
//
// The grant sets plan_expires_at to NULL on purpose: a negotiated contract is
// not on the monthly Midtrans clock, and getEffectiveSubscription() treats a
// paid plan with no expiry as active indefinitely. planRankInForce() in
// pricing.ts is what stops a later self-serve purchase from overwriting it.
//
// Run it with the OWNER connection string, not the app_rls one: `companies` is
// not an RLS table, but the owner URL is what .env.local already holds for
// migrations, and this is the same kind of operator-level task.
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
const revertIdx = args.indexOf("--revert");
// --revert exists so a deal that ends does not need hand-written SQL either.
const targetPlan = revertIdx === -1 ? "custom" : args[revertIdx + 1];
// Drop the flag and its value, then take the first thing left. Written as an
// explicit index set rather than `i !== revertIdx && i !== revertIdx + 1`,
// which quietly discards argv[0] whenever the flag is absent: indexOf returns
// -1, so the second test becomes `i !== 0`.
const consumed = new Set(revertIdx === -1 ? [] : [revertIdx, revertIdx + 1]);
const identifier = args.filter((a, i) => !consumed.has(i) && !a.startsWith("--"))[0];
const dryRun = args.includes("--dry-run");

if (!identifier) {
  console.error("Usage: node scripts/grant-custom-plan.mjs <company-email-or-id> [--revert <plan>] [--dry-run]");
  process.exit(1);
}
if (!["custom", "starter", "professional", "enterprise"].includes(targetPlan)) {
  console.error(`Unknown plan: ${targetPlan ?? "(missing after --revert)"}`);
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const matches = await sql.query(
  `select c.id, c.name, c.plan, c.plan_expires_at,
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
// Names are not unique in the schema, so an ambiguous match must stop rather
// than pick one — silently upgrading the wrong tenant to unlimited is the
// single worst outcome this script can have.
if (matches.length > 1) {
  console.error(`"${identifier}" matches ${matches.length} companies — re-run with the company id:`);
  for (const m of matches) console.error(`  ${m.id}  ${m.name}  (plan=${m.plan})`);
  process.exit(1);
}

const company = matches[0];
console.log(`Company : ${company.name} (${company.id})`);
console.log(`Users   : ${company.user_count}`);
console.log(`Plan    : ${company.plan}${company.plan_expires_at ? ` (expires ${company.plan_expires_at})` : " (no expiry)"}`);

if (company.plan === targetPlan) {
  console.log(`\nAlready on "${targetPlan}" — nothing to do.`);
  process.exit(0);
}

// Reverting to starter keeps the expiry date, matching what the rest of the app
// does with a lapsed customer: the date is what the renewal prompts are built
// on. Every other target gets a clean, non-expiring grant.
const keepExpiry = targetPlan === "starter";

if (dryRun) {
  console.log(`\n[dry run] would set ${company.plan} → ${targetPlan}${keepExpiry ? "" : " and clear the expiry"}. Nothing written.`);
  process.exit(0);
}

// A failed UPDATE must not be reported as a grant: without this the script
// prints "→ custom" on a rejected write and the deal looks done when the
// company is still on its old plan.
try {
  const updated = await sql.query(
    keepExpiry
      ? `update companies set plan = $1 where id = $2 returning id`
      : `update companies set plan = $1, plan_expires_at = null where id = $2 returning id`,
    [targetPlan, company.id],
  );
  if (updated.length === 0) throw new Error("no row updated — company disappeared mid-run?");
} catch (err) {
  console.error(`\nFAILED to set plan: ${err.message}`);
  console.error("The company is unchanged. Check the connection string and try again.");
  process.exit(1);
}

console.log(`\n→ ${company.plan} → ${targetPlan}${keepExpiry ? "" : ", expiry cleared"}`);
if (targetPlan === "custom") {
  console.log("\nReminder: Custom is uncapped, so the customer's own API keys are what");
  console.log("keep it viable. Have the admin fill in Groq + Gemini keys under");
  console.log("Admin → Subscription → API keys (the field is unlocked for this plan).");
}
