// Single source of truth for plan pricing.
//
// One price per plan, read by both the checkout charge and every price shown on
// the site, so the two can never disagree. There is no promo: see getPlanPrice
// for why the launch discount was removed rather than re-dated.

// Two different questions, and conflating them is a live bug rather than a
// style choice:
//   - PurchasablePlan — "can this be bought self-serve?" Guards checkout, and
//     is the key space for every price table. `custom` is absent on purpose:
//     it has no list price, so there is nothing to charge.
//   - PaidPlan — "is this company a paying customer?" Drives subscription
//     status, limits and expiry. `custom` IS one of these; leaving it out
//     would make getEffectiveSubscription() read a negotiated account as
//     `starter` and drop it to 10 questions a day.
export type PurchasablePlan = "personal" | "professional" | "enterprise";
export type PaidPlan = PurchasablePlan | "custom";

// Which account type may buy which plan. Both directions are refused, and both
// for the same reason: the plans are priced around seats. Selling Professional
// to one person charges them six times Personal for 49 employee slots they have
// nowhere to put, and selling Personal to a company sells a 1-seat plan to a
// workspace that already has more people in it than that.
//
// Enforced at checkout (/api/payment/create). Kept here so the price tables, the
// checkout and the dashboard read the rule from one place.
export function isPlanAllowedFor(
  plan: PurchasablePlan,
  accountType: "company" | "individual",
): boolean {
  return accountType === "individual" ? plan === "personal" : plan !== "personal";
}

// Priced for the segment this product is actually sold to: hospitals and
// clinics. The two paid company tiers keep the plan ids `professional` and
// `enterprise`, because those ids are written into Midtrans orders, the payment
// webhook, the downgrade guards and every plan-gated route — renaming them
// would be a data migration bought for nothing. What a buyer reads is "Klinik"
// and "Rumah Sakit" (src/lib/i18n.ts); what the database stores is unchanged.
//
// Why these numbers, since the ones they replace are the reason this was
// revisited. At Rp 500.000 for 100 seats, Enterprise sold an entire type-C
// hospital for Rp 5.000 per person per month. The problem with that is not
// margin, it is that the price loses the deal before the demo: a hospital reads
// it as a student project rather than a vendor. These land at Rp 60rb and
// Rp 30rb per user per month, which survives being read aloud in a procurement
// meeting, and the hospital tier's Rp 54jt/year sits inside an IT operating
// budget without tripping a formal tender.
//
// There is deliberately no second, cheaper "SMB" ladder beside this one. Two
// tracks selling the same software can only differ by price, so the cheap track
// wins every comparison a buyer makes and the expensive one never sells —
// which is exactly what a 6x-per-seat gap between the two would have done here.
// Anything that fits neither tier goes to `custom`: negotiated, set by hand,
// and not purchasable.
//
// `personal` is a different product for a different account type (one person,
// no seats) and is not part of that ladder. It is reachable only from the
// Individu tab, and isPlanAllowedFor refuses it to company accounts. It is
// still NOT a researched number — pick a real one before the first individual
// customer.
export const NORMAL_PRICES: Record<PurchasablePlan, number> = {
  personal: 119000,
  professional: 1500000,
  enterprise: 4500000,
};

// What a customer calls each plan. Separate from the plan id, which is what the
// database, Midtrans orders and every guard use and which must not change.
//
// This exists because the label is not only on the pricing page: it is on the
// plan badge in the dashboard sidebar, in the "your plan does not include this"
// errors, and on the Midtrans invoice. Those drifted apart the last time a tier
// was renamed in the price table alone, and a buyer who is quoted "Klinik" then
// billed for "Professional" has to ask whether they bought the right thing.
//
// Not translated. These are product names, and the Indonesian and English pages
// should quote a hospital the same word — "Rumah Sakit" is the name of the
// package, not a description that needs an English equivalent.
export const PLAN_LABELS: Record<Plan, string> = {
  starter: "Starter",
  personal: "Personal",
  professional: "Klinik",
  enterprise: "Rumah Sakit",
  custom: "Custom",
};

export const PLAN_NAMES: Record<PurchasablePlan, string> = {
  personal: `IntelliBase ${PLAN_LABELS.personal} — 1 Bulan`,
  professional: `IntelliBase ${PLAN_LABELS.professional} — 1 Bulan`,
  enterprise: `IntelliBase ${PLAN_LABELS.enterprise} — 1 Bulan`,
};

// Use this — never isPaidPlan — to validate anything that leads to a charge.
// It is what stops a hand-crafted POST from buying the unlimited tier for the
// Enterprise price, or for nothing at all.
export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return value === "personal" || value === "professional" || value === "enterprise";
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return isPurchasablePlan(value) || value === "custom";
}

/**
 * Whether this plan may have its questions answered by the AI.
 *
 * The free tier searches; the paid tiers are answered. Document search
 * (/search) stays open to everyone — it costs one embedding call and nothing
 * from the model that is actually scarce.
 *
 * Two problems this solves at once. Generation runs through one Groq key shared
 * by every customer at 12,000 tokens per minute, so an unbounded free tier is
 * the paying customers queueing behind people who are not paying. And the gap
 * between Starter and Personal was only a number of questions, which is a weak
 * reason to pay; "read the passage yourself" versus "have it answered, with
 * sources" is a difference someone can feel in the first minute.
 *
 * Deliberately keyed on the *effective* plan (see getEffectiveSubscription), so
 * a lapsed subscription loses answers when its grace period ends, exactly as it
 * loses every other paid limit — and gets them back the moment it renews.
 *
 * If the free tier should instead get a small taste rather than nothing, this
 * is the one function to change: return true for starter and give it a low
 * per-day allowance in PLAN_LIMITS. That trade is a product decision, not a
 * technical one, which is why it is named and in one place.
 */
export function canUseAiAnswers(plan: string | null | undefined): boolean {
  return isPaidPlan(plan);
}

export type Plan = "starter" | PaidPlan;

// Ordering, not arithmetic: only the comparisons matter, so inserting a tier in
// the middle is a renumbering and nothing else. Nothing persists these numbers.
//
// `personal` sits above starter and below professional even though the two are
// sold to different account types and can never be compared in practice — an
// individual is refused every plan but Personal, so the downgrade guard only
// ever compares Personal with Personal (a renewal) or with starter (a lapsed
// account coming back). Giving it a rank of its own keeps that guard meaningful
// if the account-type rule is ever relaxed, instead of silently treating a paid
// tier as rank 0.
const PLAN_RANK: Record<Plan, number> = {
  starter: 0,
  personal: 1,
  professional: 2,
  enterprise: 3,
  // Above enterprise so the downgrade guards in checkout and in the payment
  // webhook refuse to overwrite a negotiated account with a self-serve purchase.
  custom: 4,
};

// Ordinal tier of a plan (higher = more premium). Unknown/null → starter (0).
// Used to tell renewals/upgrades apart from downgrades.
export function planRank(plan: string | null | undefined): number {
  return plan && plan in PLAN_RANK ? PLAN_RANK[plan as Plan] : 0;
}

// The rank a new purchase has to beat before it is allowed to replace what the
// company already has. Exists because `isSubscriptionActive()` answers "is
// there a paid period still running", and a plan granted by hand has no period
// at all: a Custom account is set with no expiry date, so isSubscriptionActive
// returns false for it, both downgrade guards would read its rank as 0, and a
// Rp 200rb self-serve Professional checkout would quietly overwrite a
// negotiated unlimited contract. getEffectiveSubscription already treats a
// paid-plan-without-expiry as active forever; this makes the guards agree.
//
// Everything else is left exactly as it was — in particular a lapsed plan
// inside its grace window still ranks 0, so a customer who wants to come back
// on a smaller plan can still do that during grace instead of waiting it out.
//
// A running pilot ranks 0 for the same reason. Nothing was paid for it, so
// there is no purchase to protect, and ranking it in force would turn the
// pilot into a trap: give a hospital an Enterprise pilot, and the downgrade
// guards would refuse to let them buy the Professional plan they can actually
// afford — at checkout with a confusing refusal, or worse, in the webhook,
// which banks the payment and grants nothing.
export function planRankInForce(
  { plan, expiresAt, isPilot }: SubscriptionInput,
  now: Date = new Date(),
): number {
  if (isPilot) return 0;
  if (isPaidPlan(plan) && !expiresAt) return planRank(plan);
  return isSubscriptionActive(plan, expiresAt, now) ? planRank(plan) : 0;
}

// A paid subscription that hasn't lapsed yet.
export function isSubscriptionActive(
  plan: string | null | undefined,
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return isPaidPlan(plan) && !!expiresAt && expiresAt.getTime() > now.getTime();
}

// Days after planExpiresAt during which a lapsed paid plan still works in full.
// A customer whose transfer lands a day or two late keeps working instead of
// dropping from 300 questions/day to 10 with no warning.
//
// Deliberately not applied to a pilot (companies.isPilot): the grace exists to
// cover a payment in flight, and a free trial has none. Applying it there would
// have served fourteen days against a "7 hari" badge and taken the urgency out
// of the only conversation the pilot exists to start.
export const GRACE_PERIOD_DAYS = 7;

// How many days before expiry the renewal banner starts warning the admin.
export const RENEWAL_WARNING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus =
  | "active"    // free starter, or paid and comfortably inside the paid period
  | "expiring"  // paid and still valid, but expires within RENEWAL_WARNING_DAYS
  | "grace"     // past expiry but inside the grace window — paid limits still apply
  | "expired";  // grace used up — starter limits apply

export interface EffectiveSubscription {
  // The plan whose limits actually apply right now. This — never companies.plan
  // — is what every quota/feature check must be based on.
  plan: Plan;
  // What the company last paid for, regardless of expiry. Used for messaging
  // ("your Professional plan has ended"), never for granting access.
  purchasedPlan: Plan;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
  daysUntilExpiry: number | null; // negative once the expiry date has passed
}

// The three columns of `companies` that decide what a plan is worth right now.
//
// Passed as one object rather than three positional arguments so that adding
// `isPilot` could not be forgotten anywhere: the property is required, so a call
// site that does not mention it fails to compile. An optional flag would have
// defaulted every caller to "not a pilot", which is precisely how a pilot ends
// up honoured in one channel and given a grace period in another — the shape of
// bug that once let expired companies keep answering in Slack.
export interface SubscriptionInput {
  plan: string | null | undefined;
  expiresAt: Date | null | undefined;
  /** Undefined is allowed (a company row may not be loaded) and means "not a pilot". */
  isPilot: boolean | undefined;
}

// Single source of truth for "what is this company allowed to do right now".
// Every channel (chat UI, public API, Slack) and every plan-gated admin route
// goes through this, so an expired subscription can never keep working in one
// channel while it is blocked in another.
export function getEffectiveSubscription(
  { plan, expiresAt, isPilot }: SubscriptionInput,
  now: Date = new Date(),
): EffectiveSubscription {
  const purchasedPlan: Plan = isPaidPlan(plan) ? plan : "starter";
  const daysUntilExpiry = expiresAt
    ? Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS)
    : null;

  if (purchasedPlan === "starter") {
    // A starter company that still carries an expiry date is a lapsed customer:
    // the date is kept on downgrade precisely so we can keep asking them to renew.
    const lapsed = !!expiresAt && expiresAt.getTime() <= now.getTime();
    return {
      plan: "starter",
      purchasedPlan: "starter",
      status: lapsed ? "expired" : "active",
      expiresAt: expiresAt ?? null,
      graceEndsAt: null,
      daysUntilExpiry,
    };
  }

  // Paid plan granted without an expiry date (seeded or manually set account):
  // nothing to expire, leave it alone.
  if (!expiresAt) {
    // Unless it is flagged as a pilot, in which case the missing date is the
    // bug and "free forever" is the cost of trusting it. Fail closed: the only
    // way to reach this is a hand-edited row, since the grant writes the plan
    // and the end date in one statement.
    if (isPilot) {
      return {
        plan: "starter", purchasedPlan, status: "expired",
        expiresAt: null, graceEndsAt: null, daysUntilExpiry: null,
      };
    }
    return {
      plan: purchasedPlan, purchasedPlan, status: "active",
      expiresAt: null, graceEndsAt: null, daysUntilExpiry: null,
    };
  }

  // A pilot has no grace window at all — see the note on companies.isPilot.
  // Null rather than a date equal to expiresAt, so that anything reading this
  // (the renewal banner) cannot render "you have until <the day it ended>".
  const graceEndsAt = isPilot
    ? null
    : new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS);

  if (now.getTime() < expiresAt.getTime()) {
    return {
      plan: purchasedPlan, purchasedPlan,
      status: daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_WARNING_DAYS ? "expiring" : "active",
      expiresAt, graceEndsAt, daysUntilExpiry,
    };
  }

  if (graceEndsAt && now.getTime() < graceEndsAt.getTime()) {
    return { plan: purchasedPlan, purchasedPlan, status: "grace", expiresAt, graceEndsAt, daysUntilExpiry };
  }

  return { plan: "starter", purchasedPlan, status: "expired", expiresAt, graceEndsAt, daysUntilExpiry };
}

// One calendar month later, clamped to the end of the target month.
//
// Date.setMonth() alone overflows: 31 January + 1 month becomes "31 February",
// which JavaScript rolls forward to 2 or 3 March. Every renewal from the 29th
// onwards would hand out a few extra days and drift further each time. Setting
// the day to 1 before moving the month keeps that overflow from happening at
// all, then the day is put back — capped at the last day the new month actually
// has, so 31 Jan → 28 Feb (29 in a leap year) and 31 Dec → 31 Jan.
//
// Deliberately uses local-time accessors, like the code it replaces.
// plan_expires_at is a `timestamp` without time zone, which the driver returns as
// a Date built from local time, so getDate() is the same day-of-month Postgres
// stored; reading it in UTC would shift the day whenever the server runs off UTC.
// Vercel runs UTC, so the two agree in production — a developer in another zone
// can see a one-day difference for expiries falling near midnight.
function addOneMonth(date: Date): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);
  // Day 0 of the following month is the last day of this one.
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfMonth));
  return result;
}

// Expiry after a successful payment: when the current subscription is still
// active, stack a month onto the remaining time (renewal/upgrade keeps unused
// days); otherwise start a fresh month from now. One month per purchase.
//
// A paid plan carrying no expiry at all (getEffectiveSubscription treats that as
// active forever) therefore gains a one-month clock the first time the company
// pays. Those rows are test accounts, created deliberately with a null expiry —
// do NOT "clean them up" as bad data. Putting one on a normal billing cycle the
// moment it pays is the accepted behaviour: paying is what turns a test account
// into an ordinary one.
//
// Comped customer accounts did become a real feature, and took the separate flag
// this note used to ask for: companies.isPilot. The caller is what skips the
// stack — grantPlanForTransaction passes null instead of a pilot's expiry, so
// the paid month runs from the payment rather than from the end of the free
// week. Trial days were never bought and must not push a paid period later.
export function computeRenewedExpiry(
  currentExpiresAt: Date | null | undefined,
  now: Date = new Date(),
): Date {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? new Date(currentExpiresAt)
      : new Date(now);
  return addOneMonth(base);
}

// The authoritative price a customer is charged for a plan right now.
//
// There used to be a launch promo here, and with it a second price table, an
// end date, and a struck-through price on every card. It is gone: the prices
// above are the real ones, so a discount off a list price nobody ever paid is
// theatre, and on a page aimed at hospitals it invites the buyer to wonder what
// the number would be if they pushed. One price, stated plainly.
//
// Still takes `now`, unused, so that reintroducing a real dated promo is a
// change to this function alone rather than to all of its callers.
export function getPlanPrice(plan: PurchasablePlan, now: Date = new Date()): number {
  // TODO: MINOR — `void now` hanya untuk meredam lint atas parameter tak terpakai.
  void now;
  return NORMAL_PRICES[plan];
}

// "Rp 299.000" (id) / "Rp 299,000" (en)
export function formatRupiah(amount: number, lang: "id" | "en" = "id"): string {
  return `Rp ${amount.toLocaleString(lang === "id" ? "id-ID" : "en-US")}`;
}
