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
