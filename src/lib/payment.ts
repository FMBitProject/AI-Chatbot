import { and, eq, ne } from "drizzle-orm";
import { withTransaction } from "@/lib/db/transaction";
import { companies, transactions } from "@/lib/db/schema";
import { computeRenewedExpiry, planRank, planRankInForce } from "@/lib/pricing";
import { alertOps } from "@/lib/alerts";

export type TransactionRow = typeof transactions.$inferSelect;

export type SettleOutcome =
  /** This call claimed the order and the company now holds the plan it paid for. */
  | { result: "granted"; expiresAt: Date }
  /** Someone else claimed it first — their transaction committed the grant. */
  | { result: "duplicate" }
  /** Claimed, but the company already holds something better. Money in, nothing out. */
  | { result: "nothing-granted"; currentPlan: string };

/**
 * Marks one order paid and grants the plan it bought, exactly once.
 *
 * Three callers reach this: the Midtrans webhook, the admin's "Cek Status"
 * check, and the reconciliation sweep. Each can run at any time, more than
 * once, and concurrently with the others — so the whole thing has to be safe to
 * repeat, and it lives here rather than being copied per caller. Three copies of
 * a conditional-claim-plus-grant is three chances to fix a bug in one of them.
 *
 * The caller must already have confirmed with Midtrans that the order really is
 * settled, and for the amount we charged. This function does no network I/O and
 * makes no judgement about that.
 *
 * Idempotency comes from the conditional UPDATE: `status <> 'paid'` in the WHERE
 * clause makes claiming the order a single atomic statement, so out of any
 * number of concurrent callers exactly one gets a row back and the rest see
 * zero. That matters because granting is *not* idempotent —
 * computeRenewedExpiry() stacks another month onto the remaining time, so a
 * second grant would silently hand out a month nobody paid for.
 *
 * Claim and grant share one database transaction, and that is not a detail: a
 * crash between them would otherwise leave the order marked paid with no plan
 * granted, and every retry would skip it as a duplicate — a customer's money
 * taken and their subscription never activated, with no way back.
 */
export async function settlePaidOrder(tx: TransactionRow, logPrefix: string): Promise<SettleOutcome> {
  const outcome = await withTransaction(async (dbTx): Promise<SettleOutcome> => {
    const claimed = await dbTx.update(transactions)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(transactions.id, tx.id), ne(transactions.status, "paid")))
      .returning({ id: transactions.id });

    if (claimed.length === 0) return { result: "duplicate" };

    // FOR UPDATE, because the grant below is a read-modify-write: the new expiry
    // is computed in JS from the value read here. Two *different* paid orders
    // for the same company lock different `transactions` rows, so nothing stops
    // them reaching this point together; without the row lock both would read
    // the same expiry and the second COMMIT would overwrite the first, silently
    // swallowing a month the customer paid for.
    //
    // The lock is held until this transaction commits, which also briefly blocks
    // the quota counter's UPDATE on the same row (see consumeQuestionQuota).
    // That is one statement's worth of waiting, and it cannot deadlock: this
    // path always takes transactions before companies, and the counter is a
    // single autocommit statement holding one lock.
    const [company] = await dbTx.select().from(companies)
      .where(eq(companies.id, tx.companyId))
      .limit(1)
      .for("update");
    const now = new Date();
    const currentRank = planRankInForce(company?.plan, company?.planExpiresAt, now);

    // Grant tx.plan, never a plan named by a request body: the row is the only
    // record of what was actually charged.
    if (planRank(tx.plan) < currentRank) {
      // Downgrades are blocked at checkout (payment/create), but that check runs
      // when the order is created and the money can arrive hours later — by
      // which time an order placed on Starter may land against an Enterprise
      // subscription. Never strip the higher plan.
      //
      // The claim still commits, because nothing about this order will ever
      // change: a retry would only take this same branch again. That makes it
      // the one path that banks a payment and hands the customer nothing, which
      // is why it is reported below rather than merely logged.
      console.warn(`${logPrefix} Ignored downgrade: company=${tx.companyId} current=${company?.plan} purchased=${tx.plan}`);
      return { result: "nothing-granted", currentPlan: company?.plan ?? "starter" };
    }

    // Renewal/upgrade stacks onto any remaining time; a lapsed plan starts fresh.
    const planExpiresAt = computeRenewedExpiry(company?.planExpiresAt, now);
    const granted = await dbTx.update(companies)
      .set({ plan: tx.plan, planExpiresAt })
      .where(eq(companies.id, tx.companyId))
      .returning({ id: companies.id });

    // Nothing updated means the company row vanished under us. Throw so the
    // claim rolls back rather than banking a payment that granted nothing.
    if (granted.length === 0) {
      throw new Error(`company ${tx.companyId} not found while granting plan for order=${tx.orderId}`);
    }

    console.log(`${logPrefix} Plan set: company=${tx.companyId} plan=${tx.plan} expires=${planExpiresAt.toISOString()}`);
    return { result: "granted", expiresAt: planExpiresAt };
  });

  if (outcome.result === "nothing-granted") {
    // Deliberately outside the transaction: alertOps sends mail, and a network
    // call inside withTransaction holds the row locks it took for the whole
    // send (see @/lib/db/transaction).
    await alertOps({
      dedupeKey: `payment-nothing-granted:${tx.orderId}`,
      subject: "Paid order granted nothing — customer paid for a plan below the one they hold",
      details: {
        order: tx.orderId,
        company: tx.companyId,
        purchased: tx.plan,
        current: outcome.currentPlan,
        amount: tx.amount,
      },
    });
  }

  return outcome;
}
