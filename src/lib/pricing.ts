// Single source of truth for plan pricing and the launch promo.
//
// The promo (discounted prices) runs until PROMO_ENDS_AT; after that both the
// checkout charge and every price shown on the site automatically revert to the
// normal prices — no code change needed. To adjust the promo, edit this file.

// Two different questions, and conflating them is a live bug rather than a
// style choice:
//   - PurchasablePlan — "can this be bought self-serve?" Guards checkout, and
//     is the key space for every price table. `custom` is absent on purpose:
//     it has no list price, so there is nothing to charge.
//   - PaidPlan — "is this company a paying customer?" Drives subscription
//     status, limits and expiry. `custom` IS one of these; leaving it out
//     would make getEffectiveSubscription() read a negotiated account as
//     `starter` and drop it to 10 questions a day.
export type PurchasablePlan = "professional" | "enterprise";
export type PaidPlan = PurchasablePlan | "custom";

export const NORMAL_PRICES: Record<PurchasablePlan, number> = {
  professional: 299000,
  enterprise: 799000,
};

export const PROMO_PRICES: Record<PurchasablePlan, number> = {
  professional: 200000,
  enterprise: 500000,
};

// Promo valid through 31 December 2026 (WIB); reverts to normal prices at
// 1 January 2027 00:00 WIB (= 2026-12-31T17:00:00Z).
export const PROMO_ENDS_AT = new Date("2026-12-31T17:00:00Z");

export const PLAN_NAMES: Record<PurchasablePlan, string> = {
  professional: "IntelliBase Professional — 1 Bulan",
  enterprise: "IntelliBase Enterprise — 1 Bulan",
};

// Use this — never isPaidPlan — to validate anything that leads to a charge.
// It is what stops a hand-crafted POST from buying the unlimited tier for the
// Enterprise price, or for nothing at all.
export function isPurchasablePlan(value: unknown): value is PurchasablePlan {
  return value === "professional" || value === "enterprise";
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return isPurchasablePlan(value) || value === "custom";
}

export type Plan = "starter" | PaidPlan;

const PLAN_RANK: Record<Plan, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
  // Above enterprise so the downgrade guards in checkout and in the payment
  // webhook refuse to overwrite a negotiated account with a self-serve purchase.
  custom: 3,
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
export function planRankInForce(
  plan: string | null | undefined,
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): number {
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

// Single source of truth for "what is this company allowed to do right now".
// Every channel (chat UI, public API, Slack) and every plan-gated admin route
// goes through this, so an expired subscription can never keep working in one
// channel while it is blocked in another.
export function getEffectiveSubscription(
  plan: string | null | undefined,
  expiresAt: Date | null | undefined,
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
    return {
      plan: purchasedPlan, purchasedPlan, status: "active",
      expiresAt: null, graceEndsAt: null, daysUntilExpiry: null,
    };
  }

  const graceEndsAt = new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS);

  if (now.getTime() < expiresAt.getTime()) {
    return {
      plan: purchasedPlan, purchasedPlan,
      status: daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_WARNING_DAYS ? "expiring" : "active",
      expiresAt, graceEndsAt, daysUntilExpiry,
    };
  }

  if (now.getTime() < graceEndsAt.getTime()) {
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
// into an ordinary one. If comped *customer* accounts ever become a real
// feature, give them their own flag instead of reusing a null expiry, and skip
// the grant for that flag.
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

export function isPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < PROMO_ENDS_AT.getTime();
}

// The authoritative price a customer is charged for a plan right now.
export function getPlanPrice(plan: PurchasablePlan, now: Date = new Date()): number {
  return isPromoActive(now) ? PROMO_PRICES[plan] : NORMAL_PRICES[plan];
}

// "Rp 299.000" (id) / "Rp 299,000" (en)
export function formatRupiah(amount: number, lang: "id" | "en" = "id"): string {
  return `Rp ${amount.toLocaleString(lang === "id" ? "id-ID" : "en-US")}`;
}
