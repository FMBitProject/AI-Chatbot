import { and, count, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, chatSessions, companies, users } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { getLimits } from "@/lib/plan-limits";
import { getEffectiveSubscription, type EffectiveSubscription } from "@/lib/pricing";

type Company = typeof companies.$inferSelect;

export interface ResolvedPlan {
  // The company row after any expiry downgrade has been applied.
  company: Company | undefined;
  subscription: EffectiveSubscription;
  limits: ReturnType<typeof getLimits>;
}

// Resolves what a company may do right now, and persists the downgrade once the
// grace period is over. Every question-answering channel and every plan-gated
// admin route must start here instead of reading companies.plan directly — the
// Slack routes bypassing this check is exactly how an expired company kept
// unlimited access.
//
// planExpiresAt is deliberately NOT cleared on downgrade: keeping the date is
// what lets the dashboard say "your plan ended on X, renew". Payment stays
// correct either way — computeRenewedExpiry() starts a fresh month from a date
// in the past, and isSubscriptionActive() is false for a starter plan.
export async function resolvePlan(company: Company | undefined, now: Date = new Date()): Promise<ResolvedPlan> {
  const subscription = getEffectiveSubscription(company?.plan, company?.planExpiresAt, now);

  let resolved = company;
  if (company && subscription.status === "expired" && company.plan !== "starter") {
    await db.update(companies).set({ plan: "starter" }).where(eq(companies.id, company.id));
    resolved = { ...company, plan: "starter" };
    console.log(`[subscription] Downgraded to starter after grace: company=${company.id} was=${company.plan} expired=${company.planExpiresAt?.toISOString()}`);
  }

  return { company: resolved, subscription, limits: getLimits(subscription.plan) };
}

// Convenience wrapper for the callers that only have a company id.
export async function resolvePlanById(companyId: string, now: Date = new Date()): Promise<ResolvedPlan> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return resolvePlan(company, now);
}

export interface QuotaFailure {
  limit: number;
  period: "daily" | "monthly";
}

// Company-wide question quota, shared by the chat UI, the public API and Slack
// so the three channels can never drift apart again. Returns null when the
// question is allowed; the daily counter is already incremented by then.
export async function consumeQuestionQuota(
  companyId: string,
  limits: { maxQuestionsPerDay: number; maxQuestionsPerMonth: number },
): Promise<QuotaFailure | null> {
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Daily quota: atomic check-and-increment in one UPDATE query.
  // PostgreSQL executes this atomically — no race condition possible.
  if (limits.maxQuestionsPerDay !== -1) {
    const updated = await db.update(companies)
      .set({
        dailyQuestionCount: sql`CASE WHEN daily_question_date = ${today} THEN daily_question_count + 1 ELSE 1 END`,
        dailyQuestionDate: today,
      })
      .where(and(
        eq(companies.id, companyId),
        or(
          isNull(companies.dailyQuestionDate),
          sql`daily_question_date != ${today}`,
          lt(companies.dailyQuestionCount, limits.maxQuestionsPerDay)
        )
      ))
      .returning({ id: companies.id });

    if (updated.length === 0) {
      return { limit: limits.maxQuestionsPerDay, period: "daily" };
    }
  }

  // Monthly quota: count-based check (race window is large enough to be negligible)
  if (limits.maxQuestionsPerMonth !== -1) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [{ total: monthlyCount }] = await withTenant(companyId, (tx) => tx
      .select({ total: count() })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(
        eq(chatSessions.companyId, companyId),
        eq(chatMessages.role, "user"),
        gte(chatMessages.createdAt, startOfMonth)
      )));

    if (monthlyCount >= limits.maxQuestionsPerMonth) {
      return { limit: limits.maxQuestionsPerMonth, period: "monthly" };
    }
  }

  return null;
}

// Seats above the plan's employee limit are frozen, not deleted: the accounts
// created first keep working and the rest come back untouched the moment the
// company subscribes again. Admins are never frozen — locking the admin out of
// the dashboard would also lock them out of the renewal button.
//
// The ordering matches how the limit is enforced at creation time (every user
// of the company counts, admins included), so nobody who fitted under the plan
// they paid for gets frozen while that plan is live.
export async function isSeatActive(
  user: { id: string; role: string; companyId: string; createdAt: Date },
  maxEmployees: number,
): Promise<boolean> {
  if (maxEmployees === -1 || user.role === "admin") return true;

  const [{ total }] = await db.select({ total: count() })
    .from(users)
    .where(and(
      eq(users.companyId, user.companyId),
      lt(users.createdAt, user.createdAt),
    ));

  return total < maxEmployees;
}

export const SEAT_FROZEN_MESSAGE =
  "Akun Anda sedang tidak aktif karena jumlah karyawan melebihi batas paket perusahaan. Hubungi admin untuk memperpanjang langganan.";
