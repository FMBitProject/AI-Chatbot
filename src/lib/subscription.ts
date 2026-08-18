import { and, count, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";
import { getLimits } from "@/lib/plan-limits";
import { getEffectiveSubscription, type EffectiveSubscription } from "@/lib/pricing";

// Exported because the question-answering channels now pass the row itself
// around (for the BYOK keys on it), not just the ids and limits derived from it.
export type Company = typeof companies.$inferSelect;

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

  if (company && subscription.status === "expired" && company.plan !== "starter") {
    // Compare-and-set: only downgrade while the row still looks the way it did
    // when we read it. Without this guard a payment landing in the same
    // millisecond could be overwritten — the customer would have paid and still
    // be dropped to starter.
    const downgraded = await db.update(companies)
      .set({ plan: "starter" })
      .where(and(
        eq(companies.id, company.id),
        eq(companies.plan, company.plan),
        company.planExpiresAt
          ? eq(companies.planExpiresAt, company.planExpiresAt)
          : isNull(companies.planExpiresAt),
      ))
      .returning({ id: companies.id });

    if (downgraded.length === 0) {
      // Someone changed the row underneath us — in practice a renewal. Trust
      // the fresh row instead of forcing the downgrade over the top of it.
      const [fresh] = await db.select().from(companies).where(eq(companies.id, company.id)).limit(1);
      const freshSubscription = getEffectiveSubscription(fresh?.plan, fresh?.planExpiresAt, now);
      return { company: fresh, subscription: freshSubscription, limits: getLimits(freshSubscription.plan) };
    }

    console.log(`[subscription] Downgraded to starter after grace: company=${company.id} was=${company.plan} expired=${company.planExpiresAt?.toISOString()}`);
    return { company: { ...company, plan: "starter" }, subscription, limits: getLimits(subscription.plan) };
  }

  return { company, subscription, limits: getLimits(subscription.plan) };
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
// question is allowed; both counters are already incremented by then.
//
// Daily and monthly are checked and incremented in ONE atomic UPDATE: the
// counters only move when both guards pass, so concurrent questions can never
// overshoot a limit. Both counters live on the companies row rather than being
// derived from chat_messages, because Slack and the public API answer questions
// without ever writing chat history — counting rows there would let those
// channels slip past the monthly quota entirely.
export async function consumeQuestionQuota(
  companyId: string,
  limits: { maxQuestionsPerDay: number; maxQuestionsPerMonth: number },
): Promise<QuotaFailure | null> {
  const { maxQuestionsPerDay, maxQuestionsPerMonth } = limits;

  // Both unlimited (enterprise): nothing to enforce, and no write to make.
  if (maxQuestionsPerDay === -1 && maxQuestionsPerMonth === -1) return null;

  const now = new Date();
  const today = now.toISOString().split("T")[0]; // "YYYY-MM-DD" (UTC)
  const month = today.slice(0, 7);               // "YYYY-MM"   (UTC)

  // A new day/month resets its counter to 1 instead of incrementing.
  const guards = [eq(companies.id, companyId)];
  if (maxQuestionsPerDay !== -1) {
    guards.push(or(
      isNull(companies.dailyQuestionDate),
      sql`daily_question_date != ${today}`,
      lt(companies.dailyQuestionCount, maxQuestionsPerDay)
    )!);
  }
  if (maxQuestionsPerMonth !== -1) {
    guards.push(or(
      isNull(companies.monthlyQuestionMonth),
      sql`monthly_question_month != ${month}`,
      lt(companies.monthlyQuestionCount, maxQuestionsPerMonth)
    )!);
  }

  const updated = await db.update(companies)
    .set({
      dailyQuestionCount: sql`CASE WHEN daily_question_date = ${today} THEN daily_question_count + 1 ELSE 1 END`,
      dailyQuestionDate: today,
      monthlyQuestionCount: sql`CASE WHEN monthly_question_month = ${month} THEN monthly_question_count + 1 ELSE 1 END`,
      monthlyQuestionMonth: month,
    })
    .where(and(...guards))
    .returning({ id: companies.id });

  if (updated.length > 0) return null;

  // Nothing was updated, so one of the guards failed — read the row back to say
  // which limit was actually hit. Only runs on the rejection path.
  const [row] = await db.select({
    dailyQuestionCount: companies.dailyQuestionCount,
    dailyQuestionDate: companies.dailyQuestionDate,
    monthlyQuestionCount: companies.monthlyQuestionCount,
    monthlyQuestionMonth: companies.monthlyQuestionMonth,
  }).from(companies).where(eq(companies.id, companyId)).limit(1);

  const dailyHit = maxQuestionsPerDay !== -1
    && row?.dailyQuestionDate === today
    && row.dailyQuestionCount >= maxQuestionsPerDay;

  // Fall back to the daily limit when there is no monthly limit to blame (or the
  // row vanished), so the message can never read "monthly quota reached (-1)".
  return dailyHit || maxQuestionsPerMonth === -1
    ? { limit: maxQuestionsPerDay, period: "daily" }
    : { limit: maxQuestionsPerMonth, period: "monthly" };
}

/**
 * Gives back a question that `consumeQuestionQuota` charged for but that was
 * never answered.
 *
 * The quota has to be spent *before* the model is called — that is what makes
 * the check atomic and stops concurrent questions overshooting a limit — which
 * means a provider outage charges the customer for our failure. On a Starter
 * workspace of 30 questions a month, a bad afternoon at Groq could quietly eat
 * a third of what they paid for, and nothing in the product would ever tell
 * them why the number went down.
 *
 * Only for failures that produced no answer. A question that was answered and
 * then failed to save is still a question that was answered.
 *
 * Never throws. Callers are already on a failure path, building an error
 * response for someone; a failed refund must not turn that into a second,
 * worse failure. It logs loudly instead — an unrefunded question is a customer
 * one short, which is worth a human noticing.
 */
export async function refundQuestionQuota(
  companyId: string,
  limits: { maxQuestionsPerDay: number; maxQuestionsPerMonth: number },
  label: string,
): Promise<void> {
  // Nothing was charged, so there is nothing to give back. Mirrors the same
  // early return in consumeQuestionQuota — the two must agree, or a refund here
  // would decrement a counter that was never incremented.
  if (limits.maxQuestionsPerDay === -1 && limits.maxQuestionsPerMonth === -1) return;

  const now = new Date();
  const today = now.toISOString().split("T")[0]; // "YYYY-MM-DD" (UTC)
  const month = today.slice(0, 7);               // "YYYY-MM"   (UTC)

  try {
    // Both counters, because consumeQuestionQuota's SET clause increments both
    // regardless of which limits are -1.
    //
    // Each is guarded on its own date still matching. A question charged at
    // 23:59:59 and refunded at 00:00:01 finds `daily_question_date` already
    // rolled to the new day, and the guard declines rather than taking one off a
    // day that never charged it. That leaves the customer one question short in
    // a vanishingly rare window, which is the right way round: a counter that is
    // slightly too high self-corrects at midnight, one that is wrong for the
    // wrong day does not.
    //
    // GREATEST(…, 0) so a double refund — a retry, a second error path — can
    // never drive a counter negative and hand out free questions.
    await db.update(companies)
      .set({
        dailyQuestionCount: sql`CASE WHEN daily_question_date = ${today} THEN GREATEST(daily_question_count - 1, 0) ELSE daily_question_count END`,
        monthlyQuestionCount: sql`CASE WHEN monthly_question_month = ${month} THEN GREATEST(monthly_question_count - 1, 0) ELSE monthly_question_count END`,
      })
      .where(eq(companies.id, companyId));
  } catch (err) {
    console.error(`[${label}] Could not refund the question quota for company ${companyId}:`, err);
  }
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
