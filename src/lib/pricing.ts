// Single source of truth for plan pricing and the launch promo.
//
// The promo (discounted prices) runs until PROMO_ENDS_AT; after that both the
// checkout charge and every price shown on the site automatically revert to the
// normal prices — no code change needed. To adjust the promo, edit this file.

export type PaidPlan = "professional" | "enterprise";

export const NORMAL_PRICES: Record<PaidPlan, number> = {
  professional: 299000,
  enterprise: 799000,
};

export const PROMO_PRICES: Record<PaidPlan, number> = {
  professional: 200000,
  enterprise: 500000,
};

// Promo valid through 31 December 2026 (WIB); reverts to normal prices at
// 1 January 2027 00:00 WIB (= 2026-12-31T17:00:00Z).
export const PROMO_ENDS_AT = new Date("2026-12-31T17:00:00Z");

export const PLAN_NAMES: Record<PaidPlan, string> = {
  professional: "IntelliBase Professional — 1 Bulan",
  enterprise: "IntelliBase Enterprise — 1 Bulan",
};

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "professional" || value === "enterprise";
}

export type Plan = "starter" | PaidPlan;

const PLAN_RANK: Record<Plan, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

// Ordinal tier of a plan (higher = more premium). Unknown/null → starter (0).
// Used to tell renewals/upgrades apart from downgrades.
export function planRank(plan: string | null | undefined): number {
  return plan && plan in PLAN_RANK ? PLAN_RANK[plan as Plan] : 0;
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

// Expiry after a successful payment: when the current subscription is still
// active, stack a month onto the remaining time (renewal/upgrade keeps unused
// days); otherwise start a fresh month from now. One month per purchase.
export function computeRenewedExpiry(
  currentExpiresAt: Date | null | undefined,
  now: Date = new Date(),
): Date {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? new Date(currentExpiresAt)
      : new Date(now);
  base.setMonth(base.getMonth() + 1);
  return base;
}

export function isPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < PROMO_ENDS_AT.getTime();
}

// The authoritative price a customer is charged for a plan right now.
export function getPlanPrice(plan: PaidPlan, now: Date = new Date()): number {
  return isPromoActive(now) ? PROMO_PRICES[plan] : NORMAL_PRICES[plan];
}

// "Rp 299.000" (id) / "Rp 299,000" (en)
export function formatRupiah(amount: number, lang: "id" | "en" = "id"): string {
  return `Rp ${amount.toLocaleString(lang === "id" ? "id-ID" : "en-US")}`;
}
