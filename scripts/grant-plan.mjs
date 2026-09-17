// Puts one company on a plan by hand: either the negotiated `custom` tier, or a
// time-boxed **pilot** of a normal paid plan — the "Pilot gratis 7 hari" the
// pricing page advertises.
//
// Why a script rather than an admin screen. Two reasons, and the second is the
// load-bearing one:
//
//   1. This runs a handful of times a month at most, and every one of those
//      times is a conversation rather than a click.
//   2. There is no platform-owner role in this codebase. `users.role` is
//      `admin | employee`, and "admin" means *the customer's own admin* — the
//      person running their tenant. A "grant pilot" button in the admin
//      dashboard would therefore be a button every customer could press on
//      themselves, and defending it would mean inventing a super-admin role and
//      then protecting that escalation path against every future auth bug. A
//      command that needs the production connection string is already scoped to
//      whoever has it.
//
// Usage:
//   node scripts/grant-plan.mjs <company>                              → custom, no expiry
//   node scripts/grant-plan.mjs <company> --pilot                      → professional, 7 days
//   node scripts/grant-plan.mjs <company> --pilot --plan enterprise --days 14
//   node scripts/grant-plan.mjs <company> --revert starter             → end a deal or a pilot
//   ...add --dry-run to print the match and the intended change without writing.
//
// The company is matched by id, by exact name, or by the email of any admin
// user belonging to it — whichever you happen to have to hand.
//
// A plain (non-pilot) grant sets plan_expires_at to NULL on purpose: a
// negotiated contract is not on the monthly Midtrans clock, and
// getEffectiveSubscription() treats a paid plan with no expiry as active
// indefinitely. planRankInForce() in pricing.ts is what stops a later
// self-serve purchase from overwriting it.
//
// A pilot is the opposite: the date is the whole point. Two things about it are
// worth knowing before you promise a customer seven days, and the script prints
// both every run:
//
//   - A lapsed paid plan keeps working in full for GRACE_PERIOD_DAYS (7) after
//     plan_expires_at, so `--days 7` really means seven days of pilot followed
//     by seven days of grace before the account drops to starter. The grace
//     exists so a late bank transfer does not cut a paying customer off; a
//     pilot has no transfer to be late, so it is pure extra runway here. Run
//     `--revert starter` on the day if you want a hard stop.
//   - RENEWAL_WARNING_DAYS is also 7, so a 7-day pilot shows the renewal banner
//     in the customer's dashboard from day one. For a pilot that is the nudge
//     you want, even though the banner says "Perpanjang".
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

// Mirrored from GRACE_PERIOD_DAYS in src/lib/pricing.ts. A plain .mjs script
// cannot resolve the `@/` alias (see the note on scripts/pricing.test.mts in
// AGENTS.md), so this is a copy — if the constant there ever changes, the dates
// this script prints go stale rather than the grant going wrong.
const GRACE_PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const ALL_PLANS = ["custom", "starter", "personal", "professional", "enterprise"];
// A pilot is a taste of something the customer could go on to buy, so it is
// restricted to the purchasable tiers: `custom` is negotiated and has no expiry
// semantics, and a "pilot of starter" is just the free plan.
const PILOT_PLANS = ["personal", "professional", "enterprise"];

const args = process.argv.slice(2);
const consumed = new Set();

// Every valued flag must be read before the positional company identifier is
// picked, so that the flag's value is never mistaken for it: without this,
// `--days 7 klinik@x.com` and `--days klinik@x.com` are indistinguishable.
//
// A flag left without a value stops the run rather than returning undefined,
// which is what lets every caller below read `undefined` as "flag absent". Get
// that wrong and the failures are silent and expensive: a trailing `--days`
// would fall back to 7, and a trailing `--revert` would fall back to *granting
// custom* — an unlimited plan, from a command whose author was ending one. The
// `--` test catches the same mistake spelled `--plan --dry-run`, where the next
// flag would otherwise be swallowed as the value.
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

const revertTo = flagValue("--revert");
const planFlag = flagValue("--plan");
const daysFlag = flagValue("--days");
const pilot = args.includes("--pilot");
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

const identifier = args.filter((a, i) => !consumed.has(i) && !a.startsWith("--"))[0];

const USAGE = "Usage: node scripts/grant-plan.mjs <company-email-or-id> [--pilot [--plan <plan>] [--days <n>]] [--revert <plan>] [--dry-run] [--force]";

if (!identifier) {
  console.error(USAGE);
  process.exit(1);
}
if (pilot && revertTo !== undefined) {
  console.error("--pilot and --revert are opposites: one starts a trial, the other ends one.");
  process.exit(1);
}
// Refused rather than ignored. Silently dropping --days on a non-pilot grant
// would hand out an *indefinite* paid plan to someone who asked for seven days
// of one, and the success line would not say so.
if (!pilot && (planFlag !== undefined || daysFlag !== undefined)) {
  console.error("--plan and --days only mean anything with --pilot.");
  process.exit(1);
}

const targetPlan = pilot ? (planFlag ?? "professional") : (revertTo ?? "custom");

if (!ALL_PLANS.includes(targetPlan)) {
  console.error(`Unknown plan: ${targetPlan ?? "(missing after --revert)"}`);
  process.exit(1);
}
if (pilot && !PILOT_PLANS.includes(targetPlan)) {
  console.error(`A pilot must be of a purchasable plan (${PILOT_PLANS.join(", ")}), not "${targetPlan}".`);
  process.exit(1);
}

// Number("") is 0 and Number("7.5") is not an integer, so `--days ""` and a
// fractional day land here rather than becoming a grant with a surprising end
// date. A missing value never reaches this line — flagValue stops first.
const days = daysFlag === undefined ? 7 : Number(daysFlag);
if (pilot && (!Number.isInteger(days) || days < 1 || days > 365)) {
  console.error(`--days must be a whole number of days between 1 and 365 (got "${daysFlag}").`);
  process.exit(1);
}

const now = new Date();
const pilotEndsAt = new Date(now.getTime() + days * DAY_MS);
const accessEndsAt = new Date(pilotEndsAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
const fmt = (d) => d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const sql = neon(DATABASE_URL);

const matches = await sql.query(
  `select c.id, c.name, c.plan, c.plan_expires_at, c.account_type,
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
// than pick one — silently upgrading the wrong tenant is the single worst
// outcome this script can have.
if (matches.length > 1) {
  console.error(`"${identifier}" matches ${matches.length} companies — re-run with the company id:`);
  for (const m of matches) console.error(`  ${m.id}  ${m.name}  (plan=${m.plan})`);
  process.exit(1);
}

const company = matches[0];
const currentExpiry = company.plan_expires_at ? new Date(company.plan_expires_at) : null;

console.log(`Company : ${company.name} (${company.id})`);
console.log(`Type    : ${company.account_type}`);
console.log(`Users   : ${company.user_count}`);
console.log(`Plan    : ${company.plan}${currentExpiry ? ` (expires ${fmt(currentExpiry)})` : " (no expiry)"}`);

// `personal` is the individual tier and the team plans are seats an individual
// has nowhere to put — checkout refuses both crossings, so a pilot that granted
// one by hand would be selling a plan the customer could never renew.
if (pilot) {
  const wantsIndividual = targetPlan === "personal";
  const isIndividual = company.account_type === "individual";
  if (wantsIndividual !== isIndividual) {
    console.error(`\nA "${targetPlan}" pilot does not fit a "${company.account_type}" account — checkout would refuse the renewal.`);
    console.error(isIndividual
      ? "An individual account can only pilot: personal."
      : "A company account can only pilot: professional, enterprise.");
    process.exit(1);
  }
}

// Re-granting the same plan is a no-op for a negotiated deal, but a pilot is a
// *date* — extending or restarting one lands here and must go through.
if (!pilot && company.plan === targetPlan) {
  console.log(`\nAlready on "${targetPlan}" — nothing to do.`);
  process.exit(0);
}

// A paying customer's expiry is money. Overwriting it with a shorter pilot date
// would quietly take back time they bought, and nothing else in the app would
// ever flag it.
if (pilot && !force && currentExpiry && currentExpiry > now && currentExpiry > pilotEndsAt) {
  console.error(`\nThis company already has access until ${fmt(currentExpiry)}, which is later than this pilot would set (${fmt(pilotEndsAt)}).`);
  console.error("Refusing to shorten it. Re-run with --force if that is genuinely what you want.");
  process.exit(1);
}

// Reverting to starter keeps the expiry date, matching what the rest of the app
// does with a lapsed customer: the date is what the renewal prompts are built
// on. A plain grant gets a clean, non-expiring one.
const keepExpiry = targetPlan === "starter";

if (dryRun) {
  const change = pilot
    ? `would set ${company.plan} → ${targetPlan} as a ${days}-day pilot ending ${fmt(pilotEndsAt)}`
    : `would set ${company.plan} → ${targetPlan}${keepExpiry ? "" : " and clear the expiry"}`;
  console.log(`\n[dry run] ${change}. Nothing written.`);
  process.exit(0);
}

// A failed UPDATE must not be reported as a grant: without this the script
// prints the new plan on a rejected write and the deal looks done when the
// company is still on its old one.
try {
  const updated = pilot
    ? await sql.query(
        `update companies set plan = $1, plan_expires_at = $2 where id = $3 returning id`,
        [targetPlan, pilotEndsAt.toISOString(), company.id],
      )
    : await sql.query(
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

if (pilot) {
  console.log(`\n→ ${company.plan} → ${targetPlan}, pilot ${days} hari`);
  console.log(`   Pilot berakhir : ${fmt(pilotEndsAt)}  (banner "Perpanjang" muncul di dashboard mereka mulai sekarang)`);
  console.log(`   Akses penuh s/d: ${fmt(accessEndsAt)}  (+${GRACE_PERIOD_DAYS} hari masa tenggang, lalu turun ke starter sendirinya)`);
  console.log(`\n   Mau berhenti tepat di hari ke-${days}? node scripts/grant-plan.mjs ${company.id} --revert starter`);
} else {
  console.log(`\n→ ${company.plan} → ${targetPlan}${keepExpiry ? "" : ", expiry cleared"}`);
}

if (targetPlan === "custom") {
  console.log("\nReminder: Custom is uncapped, so the customer's own API keys are what");
  console.log("keep it viable. Have the admin fill in Groq + Gemini keys under");
  console.log("Admin → Subscription → API keys (the field is unlocked for this plan).");
}
