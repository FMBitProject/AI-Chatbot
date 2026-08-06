import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTransaction } from "@/lib/db/transaction";
import { transactions, companies } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { computeRenewedExpiry, planRank, planRankInForce } from "@/lib/pricing";
import {
  amountMatches,
  closedTransactionStatus,
  fetchMidtransStatus,
  isReversalStatus,
  isSettledStatus,
  isValidNotificationSignature,
  requireServerKey,
} from "@/lib/midtrans";
import { alertOps } from "@/lib/alerts";

interface MidtransNotification {
  order_id: string;
  transaction_status: string;
  fraud_status?: string;
  signature_key: string;
  status_code: string;
  gross_amount: string;
}

export async function POST(req: NextRequest) {
  // A body we cannot use will never become usable, so answer 400 rather than
  // throwing: an unhandled error becomes a 500, and Midtrans re-delivers
  // anything that is not a 2xx. The shape check matters as much as the parse —
  // `null` is valid JSON, and reading order_id off it would throw on this
  // public endpoint.
  let body: MidtransNotification;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("notification body is not a JSON object");
    }
    body = parsed as MidtransNotification;
  } catch {
    console.error("[payment] Notification with an unusable body rejected");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Verify signature. A missing server key is answered with a 500, never by
  // falling back to an empty key: see requireServerKey for why that would make
  // this endpoint forgeable. 500 also means Midtrans keeps retrying, so
  // notifications that arrive during a misconfiguration are not lost.
  let serverKey: string;
  try {
    serverKey = requireServerKey();
  } catch {
    console.error("[payment] MIDTRANS_SERVER_KEY is not set — cannot verify notification");
    return NextResponse.json({ error: "Payment provider not configured" }, { status: 500 });
  }

  if (!isValidNotificationSignature(body, serverKey)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const [tx] = await db.select().from(transactions).where(eq(transactions.orderId, body.order_id)).limit(1);
  if (!tx) {
    // 200, not 404: the signature was valid, so this really is Midtrans, but the
    // order does not exist here and never will — most likely a notification for
    // another environment sharing this server key. Re-delivering it would change
    // nothing, so acknowledge it and leave a trail instead.
    console.warn(`[payment] Notification for an unknown order acknowledged: order=${body.order_id} status=${body.transaction_status}`);
    return NextResponse.json({ ok: true, ignored: "unknown order" });
  }

  const isSuccess = isSettledStatus(body);

  // "failed" for a rejected order, "expired" for one that ran out of time, null
  // while it is still open. Shared with the verify route so both record the same
  // outcome the same way.
  const closedStatus = closedTransactionStatus(body.transaction_status);

  // A notification claiming success is not enough on its own to grant a plan.
  // The signature covers order_id, status_code and gross_amount — but not
  // `transaction_status` or `fraud_status`, the two fields that decide whether
  // the plan is granted. So a body that was legitimately signed once can be
  // replayed with its status rewritten to "settlement" by anyone who has seen
  // it (a leaked log, an environment sharing this server key). Two checks close
  // that: the amount must be the one we charged, and Midtrans must confirm the
  // outcome over a connection we opened and authenticated ourselves.
  //
  // Deliberately before the transaction below opens, never inside it —
  // withTransaction holds row locks for as long as its callback runs, so a
  // network call in there would block every concurrent write to the same rows.
  if (isSuccess) {
    // An order we already settled needs no confirming: the claim below is
    // guarded by `status <> 'paid'` and would match zero rows anyway, and the
    // grant is committed in the same transaction as the claim, so "paid" always
    // means "granted". Returning here keeps Midtrans' ordinary re-deliveries
    // from each costing an outbound status request.
    if (tx.status === "paid") {
      console.log(`[payment] Duplicate paid notification ignored: order=${body.order_id}`);
      return NextResponse.json({ ok: true });
    }

    if (!amountMatches(body.gross_amount, tx.amount)) {
      await alertOps({
        dedupeKey: `payment-amount:${body.order_id}`,
        subject: "Payment notification amount does not match the order",
        details: {
          order: body.order_id,
          company: tx.companyId,
          plan: tx.plan,
          notified: String(body.gross_amount),
          expected: tx.amount,
        },
      });
      // 400 rather than 500: this notification will never become acceptable, so
      // there is nothing for Midtrans to usefully retry.
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const status = await fetchMidtransStatus(body.order_id, "[payment]");
    if (!status.ok) {
      // Our own outage, a misconfiguration (wrong MIDTRANS_ENV, revoked key),
      // or a transient failure at Midtrans. 500 so the notification is
      // re-delivered rather than dropped — the order stays unsettled until we
      // can confirm it, which is the safe direction to fail.
      //
      // Alerted, not just logged: settlement now depends on this call, so a
      // configuration mistake here stops every payment from being granted while
      // the money keeps arriving. The dedupe key is global rather than
      // per-order because the plausible causes are systemic — one mail per
      // window, not one per order caught in the outage. The window is short for
      // the same reason: this is an "is it still broken?" signal, and the
      // six-hour default was chosen for per-order problems that stay true.
      await alertOps({
        dedupeKey: "payment-status-fetch-failed",
        subject: "Cannot confirm payments with Midtrans — settlements are on hold",
        windowMs: 15 * 60 * 1000,
        details: {
          order: body.order_id,
          company: tx.companyId,
          notified: String(body.transaction_status),
        },
      });
      return NextResponse.json({ error: "Could not confirm payment status" }, { status: 500 });
    }

    if (!isSettledStatus(status.data)) {
      // Midtrans itself does not agree the order is paid. Either its status API
      // is briefly lagging behind the notification it just sent, or this body
      // was forged or replayed. 500 handles both honestly: a lag resolves on the
      // next re-delivery, and a forgery never gets a plan however often it is
      // retried. Alerted because the second case is a security event, at the
      // cost of a false alarm on the rare occasions it is really the first.
      await alertOps({
        dedupeKey: `payment-unconfirmed:${body.order_id}`,
        subject: "Payment notification claims success but Midtrans does not confirm it",
        details: {
          order: body.order_id,
          company: tx.companyId,
          notified: body.transaction_status,
          midtrans: status.data.transaction_status ?? "unknown",
        },
      });
      return NextResponse.json({ error: "Payment status not confirmed" }, { status: 500 });
    }

    if (!amountMatches(status.data.gross_amount, tx.amount)) {
      // Confirmed paid, but not for the amount we billed. Nothing automated can
      // resolve that safely.
      await alertOps({
        dedupeKey: `payment-amount:${body.order_id}`,
        subject: "Midtrans confirms a payment for an amount we did not charge",
        details: {
          order: body.order_id,
          company: tx.companyId,
          plan: tx.plan,
          paid: String(status.data.gross_amount),
          expected: tx.amount,
        },
      });
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }
  }

  // Every database failure below returns 500 on purpose: Midtrans retries a
  // notification it could not deliver, and the work here is written to be safe
  // to repeat, so a retry is exactly the recovery we want.
  try {
    if (isSuccess) {
      // Midtrans re-sends a notification when our response is slow, non-2xx, or
      // simply on its retry schedule, and the same order can also be settled by
      // payment/verify. Extending the plan is not idempotent
      // (computeRenewedExpiry stacks a month onto the remaining time), so only
      // the delivery whose conditional UPDATE actually flips status → paid gets
      // to apply it; duplicates match zero rows and stop.
      //
      // Claim and grant share one transaction so they cannot come apart: a crash
      // between them would otherwise leave the order marked paid with no plan
      // granted, and every retry would skip it as a duplicate — the customer's
      // money taken and their subscription never activated, unrecoverably.
      const outcome = await withTransaction(async (dbTx) => {
        const claimed = await dbTx.update(transactions)
          .set({ status: "paid", paidAt: new Date() })
          .where(and(eq(transactions.orderId, body.order_id), ne(transactions.status, "paid")))
          .returning({ id: transactions.id });

        if (claimed.length === 0) return { result: "duplicate" as const };

        // FOR UPDATE, because the grant below is a read-modify-write: the new
        // expiry is computed in JS from the value read here. Two *different*
        // paid orders for the same company lock different `transactions` rows,
        // so nothing stops them reaching this point together; without the row
        // lock both would read the same expiry and the second COMMIT would
        // overwrite the first, silently swallowing a month the customer paid for.
        const [company] = await dbTx.select().from(companies)
          .where(eq(companies.id, tx.companyId))
          .limit(1)
          .for("update");
        const now = new Date();
        const currentRank = planRankInForce(company?.plan, company?.planExpiresAt, now);

        if (planRank(tx.plan) < currentRank) {
          // Downgrades are blocked at checkout (payment/create); if one still reaches
          // here, never strip a paying customer's higher plan — leave it untouched.
          //
          // The order still commits as paid, because nothing about it will ever
          // change: retrying would take the same branch forever. So this is the
          // one path where we bank a payment and hand the customer nothing, and
          // it is reported as such by the caller — a log line alone would leave
          // the money sitting here until they thought to complain.
          console.warn(`[payment] Ignored downgrade from webhook: company=${tx.companyId} current=${company?.plan} purchased=${tx.plan}`);
          return { result: "nothing-granted" as const, currentPlan: company?.plan ?? "starter" };
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
          throw new Error(`company ${tx.companyId} not found while granting plan for order=${body.order_id}`);
        }

        console.log(`[payment] Plan set: company=${tx.companyId} plan=${tx.plan} expires=${planExpiresAt.toISOString()}`);
        return { result: "granted" as const };
      });

      if (outcome.result === "duplicate") {
        console.log(`[payment] Duplicate paid notification ignored: order=${body.order_id}`);
      } else if (outcome.result === "nothing-granted") {
        // Deliberately outside the transaction: alertOps sends mail, and a
        // network call inside withTransaction would hold the row locks it took
        // for as long as the send lasts (see @/lib/db/transaction).
        await alertOps({
          dedupeKey: `payment-nothing-granted:${body.order_id}`,
          subject: "Paid order granted nothing — customer paid for a plan below the one they hold",
          details: {
            order: body.order_id,
            company: tx.companyId,
            purchased: tx.plan,
            current: outcome.currentPlan,
            amount: tx.amount,
          },
        });
      }
    } else if (closedStatus) {
      // `status <> 'paid'` on both branches so a late cancel/expire/pending
      // notification can never rewrite an order we already settled and granted.
      await db.update(transactions)
        .set({ status: closedStatus })
        .where(and(eq(transactions.orderId, body.order_id), ne(transactions.status, "paid")));
    } else if (body.transaction_status === "pending") {
      await db.update(transactions)
        .set({ status: "pending" })
        .where(and(eq(transactions.orderId, body.order_id), ne(transactions.status, "paid")));
    } else if (isReversalStatus(body.transaction_status)) {
      // Deliberately not automated — see isReversalStatus. Money has gone back
      // to the customer while their subscription is still running, so this is
      // mailed as well as logged: a log line nobody reads means free service
      // until somebody happens to notice.
      await alertOps({
        dedupeKey: `payment-reversal:${body.order_id}`,
        subject: "Money reversed on a paid order — needs manual review",
        details: {
          order: body.order_id,
          company: tx.companyId,
          plan: tx.plan,
          status: body.transaction_status,
          amount: tx.amount,
        },
      });
    } else {
      console.log(`[payment] Notification with no action taken: order=${body.order_id} status=${body.transaction_status}`);
    }
  } catch (err) {
    console.error(`[payment] Failed to process notification for order=${body.order_id} status=${body.transaction_status}:`, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
