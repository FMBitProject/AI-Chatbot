import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import {
  amountMatches,
  closedTransactionStatus,
  fetchMidtransStatus,
  isReversalStatus,
  isSettledStatus,
} from "@/lib/midtrans";
import { settlePaidOrder } from "@/lib/payment";
import { alertOps } from "@/lib/alerts";

// Reading the request headers already opts this handler out of caching, but a
// reconciliation sweep served from a cache would be silently useless, so say so.
export const dynamic = "force-dynamic";

// No maxDuration on purpose. Declaring one above the hosting plan's ceiling
// fails the deployment, and `main` deploys itself — so an unverified number
// here is a way to break production for a sweep that does not need it. The run
// is bounded below instead, by a budget short enough to fit inside any plan's
// limit, and the sweep is resumable by construction: a shorter run just means
// fewer orders per pass.

// Young orders are left alone: the customer may still be on the Snap screen, and
// the webhook usually settles a payment within seconds. Sweeping them would only
// race the notification for no gain.
const MIN_AGE_MINUTES = 10;

// Past this, stop asking. An order Midtrans finished is closed by the first
// sweep that sees it, so anything still pending after a week is one we could
// never confirm — and polling it forever would spend outbound requests on a
// question that is not going to change. It keeps its "pending" status because
// that is the honest record: we do not know.
const MAX_AGE_DAYS = 7;

// Upper bound on one run. Each candidate costs a Midtrans round trip, so this
// caps both the outbound traffic and the time before the loop even starts.
const BATCH_SIZE = 25;

// Deliberately short — inside even a 10-second function limit, so the loop
// finishes on its own terms rather than being cut off by the platform. That
// distinction matters: everything settled is already committed either way, but
// only a loop that *returns* reaches the "the webhook is leaking" alert below.
// Being killed mid-run would silently drop exactly the signal this route exists
// to raise.
//
// Whatever is left over is picked up by the next run: candidates are re-selected
// from scratch each time, and every order settles in its own transaction, so
// stopping early leaves nothing half-done.
const RUN_BUDGET_MS = 8 * 1000;

// Say so at boot, the way @/lib/mail does for RESEND_API_KEY and for the same
// reason: without the secret this route refuses every caller, Vercel Cron
// included, so the sweep is simply dead — and a dead sweep looks exactly like a
// healthy one from the outside. A missing recovery mechanism that nobody
// notices is the failure this route was written to prevent.
if (!process.env.CRON_SECRET) {
  console.warn("[payment/reconcile] CRON_SECRET is not set — the reconciliation sweep will reject every caller, including Vercel Cron.");
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = req.headers.get("authorization");
  if (!provided) return false;

  // Constant-time, so the response time cannot be used to recover the secret a
  // character at a time. timingSafeEqual throws on a length mismatch, hence the
  // length check first.
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(`Bearer ${secret}`, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Asks Midtrans about every payment we never saw the end of, and finishes it.
 *
 * The webhook is how a payment normally settles, and /api/payment/verify is how
 * a customer sitting on the success page settles one the webhook missed. Both
 * can fail at once, and the failure is invisible: Midtrans re-delivers a
 * notification only for a limited window, and a bank transfer is typically paid
 * long after the tab was closed, so nobody is on the site to trigger the manual
 * check. Without this route the outcome is money received for a subscription
 * that is never activated, with nothing in the logs to say so.
 *
 * Push (the webhook) is an optimisation; pull (this) is the guarantee. That is
 * why it asks Midtrans rather than trusting anything stored here.
 *
 * Called by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    // Same answer whether the secret is wrong or unset — an unauthenticated
    // caller learns nothing about which.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Ages are compared against now() inside Postgres rather than a JS Date built
  // here: created_at is written by the database's own clock (defaultNow), and a
  // timestamp is only meaningful against the clock that wrote it. It also keeps
  // the window honest on a server whose zone is not UTC — `timestamp` carries no
  // zone, so the driver hands it back as local time.
  const candidates = await db.select().from(transactions)
    .where(and(
      eq(transactions.status, "pending"),
      sql`${transactions.createdAt} < now() - ${sql.raw(`interval '${MIN_AGE_MINUTES} minutes'`)}`,
      sql`${transactions.createdAt} > now() - ${sql.raw(`interval '${MAX_AGE_DAYS} days'`)}`,
    ))
    // Least recently checked first, never-checked before that.
    //
    // Oldest-created-first sounds fairer and is not: an order Midtrans will
    // never answer for (a sandbox id in production, say) stays pending, stays
    // the oldest, and is picked again on every run. Enough of those and the
    // batch is consumed by orders that can never resolve, while a payment that
    // landed an hour ago waits behind them until it ages out entirely. Ordering
    // by when we last *looked* makes every failure rotate to the back, so the
    // sweep always makes progress.
    //
    // NULLS FIRST spelled out, because Postgres sorts nulls LAST for ASC by
    // default — which would put never-checked orders, the ones most likely to
    // be a payment nobody has confirmed yet, at the very back of the queue.
    .orderBy(sql`${transactions.lastCheckedAt} ASC NULLS FIRST`, asc(transactions.createdAt))
    .limit(BATCH_SIZE);

  let checked = 0;
  let recovered = 0;
  let closed = 0;
  let unreachable = 0;

  // Every order this run actually asked about, whatever came back. Stamped in
  // one statement after the loop so a failed check still counts as a look and
  // rotates to the back of the queue — the rows left untouched by the time
  // budget keep their NULL and stay at the front, which is what we want.
  const looked: string[] = [];

  for (const tx of candidates) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    checked++;
    looked.push(tx.id);

    const status = await fetchMidtransStatus(tx.orderId, "[payment/reconcile]");
    if (!status.ok) {
      // Already logged. Leave the row pending and try again next run.
      unreachable++;
      continue;
    }

    if (isSettledStatus(status.data)) {
      // Same amount check the other two paths make: a plan is never granted off
      // a sum nobody here recognises.
      if (!amountMatches(status.data.gross_amount, tx.amount)) {
        await alertOps({
          dedupeKey: `payment-amount:${tx.orderId}`,
          subject: "Midtrans confirms a payment for an amount we did not charge",
          details: {
            order: tx.orderId,
            company: tx.companyId,
            plan: tx.plan,
            paid: String(status.data.gross_amount),
            expected: tx.amount,
          },
        });
        continue;
      }

      try {
        const outcome = await settlePaidOrder(tx, "[payment/reconcile]");
        if (outcome.result === "granted") recovered++;
      } catch (err) {
        // One order failing must not abandon the rest of the batch.
        console.error(`[payment/reconcile] Could not settle order=${tx.orderId}:`, err);
      }
      continue;
    }

    // Not settled. Record a definitive close so the order stops being a
    // candidate and stops showing as "Menunggu" in the dashboard forever.
    //
    // A reversal counts as terminal here too, which it is not for a *paid*
    // order (closedTransactionStatus deliberately returns null for refunds, so
    // a settled order keeps its "paid" status and its idempotency guard). But
    // this order was never marked paid: the money came and went, nothing was
    // granted, and leaving it open would poll and re-alert it on every run for
    // a week. "failed" is the honest record — no subscription came of it.
    const reversed = isReversalStatus(status.data.transaction_status);
    const closedStatus = closedTransactionStatus(status.data.transaction_status) ?? (reversed ? "failed" : null);
    if (closedStatus) {
      // RETURNING, so the counter reflects rows actually changed. `.then()` on
      // the bare update resolved whether or not the guard below matched, and an
      // order settled by the webhook a moment earlier was counted as closed.
      const marked = await db.update(transactions)
        .set({ status: closedStatus })
        .where(and(eq(transactions.id, tx.id), ne(transactions.status, "paid")))
        .returning({ id: transactions.id })
        .catch((err) => {
          console.error(`[payment/reconcile] Could not mark order=${tx.orderId} ${closedStatus}:`, err);
          return [];
        });
      if (marked.length > 0) closed++;
    }

    // A refund on an order we never marked paid should not pass unnoticed
    // either. Same policy as everywhere else: surfaced, never automated.
    if (reversed) {
      await alertOps({
        dedupeKey: `payment-reversal:${tx.orderId}`,
        subject: "Money reversed on a paid order — needs manual review",
        details: {
          order: tx.orderId,
          company: tx.companyId,
          plan: tx.plan,
          status: status.data.transaction_status ?? "unknown",
          amount: tx.amount,
        },
      });
    }
  }

  // One statement for the whole batch: this is bookkeeping, and paying a round
  // trip per order for it would eat the run budget that the actual work needs.
  // Best-effort — if it fails, the only consequence is that these orders keep
  // their place at the front of the queue and get looked at again next run.
  if (looked.length > 0) {
    await db.update(transactions)
      .set({ lastCheckedAt: new Date() })
      .where(inArray(transactions.id, looked))
      .catch((err) => console.error("[payment/reconcile] Could not stamp last_checked_at:", err));
  }

  if (recovered > 0) {
    // Every order settled here is one the webhook should have settled and did
    // not. The sweep did its job, but a leak that stays quiet is a leak that
    // grows, so it is reported rather than merely counted.
    await alertOps({
      dedupeKey: "payment-reconcile-recovered",
      subject: "Payments were settled by the reconciliation sweep, not by the webhook",
      windowMs: 60 * 60 * 1000,
      details: { recovered: String(recovered), checked: String(checked) },
    });
  }

  console.log(`[payment/reconcile] checked=${checked} recovered=${recovered} closed=${closed} unreachable=${unreachable} candidates=${candidates.length}`);
  return NextResponse.json({ ok: true, checked, recovered, closed, unreachable });
}
