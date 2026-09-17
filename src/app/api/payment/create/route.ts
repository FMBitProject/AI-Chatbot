import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { companies, transactions } from "@/lib/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import {
  amountMatches,
  cancelMidtransTransaction,
  closedTransactionStatus,
  createSnapTransaction,
  fetchMidtransStatus,
  isSettledStatus,
} from "@/lib/midtrans";
import { settlePaidOrder } from "@/lib/payment";
import { alertOps } from "@/lib/alerts";
import { getPlanPrice, PLAN_NAMES, isPlanAllowedFor, isPurchasablePlan, planRank, planRankInForce } from "@/lib/pricing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

// Each accepted call opens a real transaction at Midtrans and writes a row here,
// so a stuck retry loop or a stolen session should not be able to run up either
// without limit. Well above what a customer clicking "Bayar" can reach.
const CREATE_LIMIT = { max: 5, windowMs: 60 * 1000 };

// How long a pending order is offered back instead of a new one. Matches the
// default Midtrans transaction lifetime: past it the Snap token and any virtual
// account issued with it are dead, so there is nothing left to reuse.
const PENDING_REUSE_HOURS = 24;

// How many pending orders one checkout will ask Midtrans about. One is the
// normal case. transactions_one_pending_per_plan allows at most one per plan,
// and there are three purchasable plans, so four is already more than can
// legitimately exist. Capped because each one costs an outbound request on a
// path the customer is waiting on.
const MAX_PENDING_TO_CHECK = 4;

/**
 * Postgres' SQLSTATE for a unique violation, which is how
 * transactions_one_pending_per_plan reports that another request got there
 * first. Checked structurally rather than by constraint name: the drivers do not
 * agree on whether they surface one, and the recovery below works out which
 * constraint it was by looking for the row that beat us.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  // Kept under the old name: `dbUser` is threaded through the whole checkout
  // below (customer details, order ownership, log lines), and its `companyId` is
  // now a plain string rather than a nullable one.
  const dbUser = guard.user;

  const limit = await consumeRateLimit(`payment-create:${dbUser.id}`, CREATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Terlalu banyak percobaan pembayaran. Coba lagi sebentar lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // Guarded, so a body that is not JSON is the 400 it actually is. Unguarded,
  // req.json() throws and Next answers 500 — which reads in the logs as "our
  // server is broken" for what is only a malformed request.
  let plan: unknown;
  try {
    ({ plan } = await req.json() as { plan: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Purchasable, not merely paid: `custom` has no list price, so accepting it
  // here would mean charging an unlimited plan whatever the request asked for.
  if (!isPurchasablePlan(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // The plan has to fit the kind of account buying it, and this is the only
  // place that can say so. The pricing page shows one audience's cards at a
  // time, but the tab it shows is a client-side choice and the plan travels in
  // the request body — so "an individual bought Enterprise" is one edited fetch
  // away, and it would be honoured: the checkout would charge Rp 500rb–799rb for
  // 199 employee seats in a workspace that cannot create a second user, and the
  // limits it grants (2000 questions/day) are ones we priced for an
  // organisation. The mirror case is worse for us: a company on Personal would
  // hold a 1-seat price with all of its existing employees still in place.
  if (!isPlanAllowedFor(plan, dbUser.accountType)) {
    return NextResponse.json(
      {
        error: "plan_not_available",
        message: dbUser.accountType === "individual"
          ? "Paket ini khusus untuk akun perusahaan. Akun individu berlangganan paket Personal."
          : "Paket Personal khusus untuk akun individu. Akun perusahaan memilih Professional atau Enterprise.",
      },
      { status: 403 },
    );
  }

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Block buying a lower tier while a paid subscription is still active — a
  // downgrade would strip time the customer already paid for. They can switch
  // once the current period lapses. Renewals (same tier) and upgrades are fine.
  if (planRank(plan) < planRankInForce({ plan: company.plan, expiresAt: company.planExpiresAt, isPilot: company.isPilot })) {
    return NextResponse.json(
      {
        error: "downgrade_not_allowed",
        message:
          "Langganan Anda saat ini masih aktif. Beralih ke paket yang lebih rendah bisa dilakukan setelah periode berjalan berakhir.",
      },
      { status: 409 },
    );
  }

  // Never hand out a second live way to pay for the same thing.
  //
  // Each checkout opens its own Midtrans transaction, and for the payment
  // methods most customers here use that means its own virtual account number,
  // valid until the order expires. So a customer who clicks "Bayar" twice — or
  // comes back the next day because they lost the first VA number — ends up
  // holding two numbers that both work, and transferring to both charges them
  // twice for one month. Reusing the order they already have is what makes
  // clicking twice harmless.
  //
  // Every plan, not just the one being bought. The reuse above is per plan
  // because only a same-plan order can be handed back, but the *danger* is not:
  // transactions_one_pending_per_plan permits one live order for Professional
  // and another for Enterprise at the same time, which is two virtual account
  // numbers that both work. Paying both charges the customer twice, and the
  // second one to settle is the lower tier, so it lands in settlePaidOrder's
  // "nothing-granted" branch — money banked, nothing given, resolved by hand.
  // Anything still open for another plan is therefore closed further down
  // before a new order is minted.
  //
  // Several are fetched, not one, because there may already *be* several: every
  // checkout before this guard existed minted its own order, so a company can
  // carry more than one live at once. Looking only at the newest would settle
  // or close that one, find nothing else, and mint yet another alongside the
  // older ones still standing. Newest first — those have the most token life
  // left and are the likeliest to still be payable.
  const pendings = await db.select().from(transactions)
    .where(and(
      eq(transactions.companyId, dbUser.companyId),
      eq(transactions.status, "pending"),
      // Compared against now() inside Postgres, not a JS Date built here:
      // created_at is written by the database's own clock (defaultNow), and a
      // timestamp is only meaningful against the clock that wrote it. The
      // column carries no time zone, so a server running off UTC would shift
      // this window by its offset if the cutoff came from JS.
      sql`${transactions.createdAt} > now() - ${sql.raw(`interval '${PENDING_REUSE_HOURS} hours'`)}`,
    ))
    .orderBy(desc(transactions.createdAt))
    .limit(MAX_PENDING_TO_CHECK);

  if (pendings.length > 0) {
    // In parallel: the normal case is one order and one request, but when there
    // are several, asking in sequence would put the customer behind up to three
    // round trips before their checkout even starts.
    const checked = await Promise.all(
      pendings.map(async (order) => ({
        order,
        status: await fetchMidtransStatus(order.orderId, "[payment/create]"),
      })),
    );

    // Already paid comes first, whichever order it belongs to. This is the lost
    // notification case: the customer paid, we never recorded it, and they came
    // back to pay again. Selling them a second order here is exactly the double
    // charge this whole block exists to prevent.
    const settled = checked.find((c) => c.status.ok && isSettledStatus(c.status.data));
    if (settled && settled.status.ok) {
      const paidOrder = settled.order;

      if (!amountMatches(settled.status.data.gross_amount, paidOrder.amount)) {
        // Paid, but not for what we billed. Same alert the webhook, verify and
        // the reconciliation sweep raise — this was the one settled-order path
        // that stayed silent, and it told the customer their payment had gone
        // through while granting them nothing.
        await alertOps({
          dedupeKey: `payment-amount:${paidOrder.orderId}`,
          subject: "Midtrans confirms a payment for an amount we did not charge",
          details: {
            order: paidOrder.orderId,
            company: paidOrder.companyId,
            plan: paidOrder.plan,
            paid: String(settled.status.data.gross_amount),
            expected: paidOrder.amount,
          },
        });
        return NextResponse.json(
          {
            error: "amount_mismatch",
            message: "Pembayaran perlu diperiksa manual. Tim kami akan menindaklanjuti.",
            orderId: paidOrder.orderId,
          },
          { status: 409 },
        );
      }

      try {
        await settlePaidOrder(paidOrder, "[payment/create]");
      } catch (err) {
        // The money is ours and the plan is not theirs. Say so, instead of
        // reporting the success below on work that did not happen — the order
        // stays pending, so the next click (or the sweep) retries it.
        console.error(`[payment/create] Could not settle already-paid order=${paidOrder.orderId}:`, err);
        return NextResponse.json(
          {
            error: "settle_failed",
            message: "Pembayaran Anda sudah kami terima, tapi aktivasinya belum berhasil. Coba lagi sebentar lagi — jika masih sama, hubungi kami.",
            orderId: paidOrder.orderId,
          },
          { status: 500 },
        );
      }

      // The settled order is not necessarily the plan being bought now: this
      // block looks at every open order, so it can be the Professional order
      // the customer abandoned before coming back for Enterprise. Saying which
      // plan was activated matters — the plan they just clicked is not the one
      // they now hold, and the retry they are invited to make is re-evaluated
      // against the company row this settlement has just changed (the downgrade
      // check above reads it fresh on every call).
      const paidPlanName = isPurchasablePlan(paidOrder.plan) ? PLAN_NAMES[paidOrder.plan] : paidOrder.plan;
      return NextResponse.json(
        {
          error: "already_paid",
          message: paidOrder.plan === plan
            ? "Pembayaran Anda untuk paket ini sudah kami terima. Silakan buka dashboard untuk melihat status langganan."
            : `Pembayaran Anda untuk paket ${paidPlanName} sudah kami terima dan langganan itu sudah kami aktifkan. Silakan buka dashboard untuk melihat statusnya.`,
          orderId: paidOrder.orderId,
        },
        { status: 409 },
      );
    }

    // Close every order Midtrans has finished with, not just the first: they
    // cannot be paid any more, and leaving them "pending" both clutters the
    // dashboard and keeps them coming back as candidates here and in the sweep.
    const finished = checked.flatMap((c) => {
      if (!c.status.ok) return [];
      const closedStatus = closedTransactionStatus(c.status.data.transaction_status);
      return closedStatus ? [{ order: c.order, closedStatus }] : [];
    });
    for (const { order, closedStatus } of finished) {
      await db.update(transactions)
        .set({ status: closedStatus })
        .where(and(eq(transactions.id, order.id), ne(transactions.status, "paid")))
        .catch((err) => console.error(`[payment/create] Could not mark order=${order.orderId} ${closedStatus}:`, err));
    }

    // Anything still open is reused rather than replaced. An unreachable status
    // counts as open on purpose: a token minted inside the window is almost
    // certainly still good, and reusing it can never create a second way to pay,
    // while minting a new order on a bad guess can.
    //
    // Only an order for the plan being bought can be handed back: returning an
    // Enterprise checkout to someone who asked for Professional would charge
    // them the wrong price for the wrong thing.
    //
    // The same plan at a different price is the same mistake, one step subtler,
    // and it is what a price change makes possible. An order opened before the
    // change carries the old amount in its Snap token, so handing it back means
    // the page quotes Rp 1.500.000 while Midtrans opens a bill for Rp 200.000.
    // Nothing downstream catches that: amountMatches compares what Midtrans
    // reports against what *this order* invoiced, which is the check for a
    // customer paying something other than what we billed — not for us billing
    // something other than the list price. Both agree on the stale figure and
    // the plan is granted.
    //
    // Compared as the stored string against a freshly stringified price, not as
    // numbers, because `amount` is a text column: "200000" is what is written,
    // and a mismatch here should fall through to the mint path below, which
    // already closes the old order at Midtrans before opening a new one — so the
    // stale virtual account stops being payable rather than living alongside the
    // new one.
    const currentAmount = String(getPlanPrice(plan));
    const reusable = checked.find(
      (c) =>
        c.order.plan === plan &&
        c.order.amount === currentAmount &&
        c.order.snapToken !== null &&
        (!c.status.ok || !closedTransactionStatus(c.status.data.transaction_status)),
    );
    if (reusable?.order.snapToken) {
      // An order left open for another plan is deliberately not closed on this
      // path. Handing back a token the customer already has creates no second
      // way to pay, so there is nothing new to protect them from, and cancelling
      // an order they may be about to pay would be worse than leaving it.
      console.log(`[payment/create] Reusing pending order: company=${dbUser.companyId} order=${reusable.order.orderId}`);
      return NextResponse.json({ token: reusable.order.snapToken, orderId: reusable.order.orderId, reused: true });
    }

    // Nothing to hand back, so a new order is about to be minted — and this is
    // the moment a second live way to pay would come into existence. Every order
    // still open for a different plan is closed first, at Midtrans as well as
    // here: the row is ours to rewrite, but the virtual account number belongs
    // to Midtrans and stays payable until Midtrans is told otherwise.
    for (const c of checked) {
      // A same-plan order with no token never became a way to pay, so there is
      // nothing at Midtrans to cancel; transactions_one_pending_per_plan handles
      // that row when the insert below runs.
      //
      // A same-plan order WITH a token that was not reused is a different thing
      // entirely, and it only exists because the price moved. It has to be closed
      // here like any other live order. Skipping it — which this loop used to do
      // for every same-plan row — would leave it pending, the insert below would
      // hit the unique index, and the "lost the race" branch would hand the
      // customer back that very order's token: the stale price again, by a
      // longer route.
      if (c.order.plan === plan && c.order.snapToken === null) continue;
      // Already closed by the loop above.
      if (c.status.ok && closedTransactionStatus(c.status.data.transaction_status)) continue;

      const samePlan = c.order.plan === plan;
      const otherPlanName = isPurchasablePlan(c.order.plan) ? PLAN_NAMES[c.order.plan] : c.order.plan;

      if (!c.status.ok && !c.status.notFound) {
        // Midtrans is unreachable, so whether that order can still take money is
        // exactly what we do not know. Minting anyway is the one irreversible
        // choice available here, and it is the one that can cost the customer a
        // second month. Ask them to come back instead.
        console.warn(`[payment/create] Cannot confirm open order=${c.order.orderId} (${c.order.plan}); refusing to open a second checkout for company=${dbUser.companyId}`);
        return NextResponse.json(
          {
            error: "status_unavailable",
            message: "Kami belum bisa memastikan status pesanan Anda yang masih terbuka. Coba lagi beberapa saat lagi.",
            orderId: c.order.orderId,
          },
          { status: 503 },
        );
      }

      if (c.status.ok) {
        // Registered at Midtrans, which for a virtual account means a number the
        // customer can transfer to right now. Cancelling is what makes it stop
        // working.
        const cancelled = await cancelMidtransTransaction(c.order.orderId, "[payment/create]");
        if (!cancelled) {
          // Midtrans refused. The most likely reason is that the order settled
          // in the seconds since the status check above, so the row is left
          // pending on purpose — the webhook, the next checkout and the
          // reconciliation sweep all still see it, which they would not if it
          // were filed as closed here.
          return NextResponse.json(
            {
              error: samePlan ? "pending_stale_price" : "pending_other_plan",
              // Same plan means the open order is the one whose price has moved,
              // and telling that customer to "finish the other payment" would be
              // telling them to pay the old amount. Say what is true instead:
              // there is a live order we could not cancel, and it will lapse.
              message: samePlan
                ? `Masih ada pesanan pembayaran lama untuk paket ${otherPlanName} yang belum bisa kami tutup. Tunggu sampai kedaluwarsa (maksimal 24 jam), lalu coba lagi — atau hubungi kami kalau mendesak.`
                : `Masih ada pesanan pembayaran yang aktif untuk paket ${otherPlanName}. Selesaikan pembayaran itu dulu, atau tunggu sampai kedaluwarsa (maksimal 24 jam), lalu coba lagi.`,
              orderId: c.order.orderId,
            },
            { status: 409 },
          );
        }
      }
      // The remaining case is notFound: a Snap token the customer was given but
      // never opened, so Midtrans has no transaction to cancel and no payment
      // instrument was ever issued. Nothing to do there but close our own row.

      // "expired" rather than "failed": nothing was rejected, the payment window
      // was simply abandoned. It is also the status the reconciliation sweep
      // re-checks for a late settlement, which keeps the narrow race above (an
      // order that settles between the status check and the cancel) recoverable
      // without a human.
      await db.update(transactions)
        .set({ status: "expired" })
        .where(and(eq(transactions.id, c.order.id), ne(transactions.status, "paid")))
        .catch((err) => console.error(`[payment/create] Could not close open order=${c.order.orderId}:`, err));
      console.log(`[payment/create] Closed ${samePlan ? "stale-price" : "other-plan"} order=${c.order.orderId} (${c.order.plan}, amount=${c.order.amount}) before opening ${plan} checkout for company=${dbUser.companyId}`);
    }
  }

  // A timestamp is a time, not an identifier: two checkouts for the same plan in
  // the same millisecond used to produce the same order_id, and order_id is
  // unique both here (schema) and at Midtrans. The random suffix is what makes
  // it an id — the timestamp stays only because it makes an order readable at a
  // glance in the Midtrans dashboard.
  const orderId = `IB-${plan.toUpperCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  // Price is resolved server-side (promo-aware) so the client can never dictate it.
  const amount = getPlanPrice(plan);

  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    item_details: [{
      id: plan,
      price: amount,
      quantity: 1,
      name: PLAN_NAMES[plan],
    }],
    customer_details: {
      first_name: dbUser.name,
      email: dbUser.email,
    },
    callbacks: {
      finish: `${process.env.BETTER_AUTH_URL}/payment/success?plan=${plan}`,
      error: `${process.env.BETTER_AUTH_URL}/payment/failed`,
      pending: `${process.env.BETTER_AUTH_URL}/payment/pending`,
    },
  };

  let snapResponse: { token: string; redirect_url: string };
  try {
    snapResponse = await createSnapTransaction(parameter);
  } catch (err) {
    // A refusal from Midtrans, a timeout, or an unset server key. Nothing has
    // been written here yet and the customer has no token, so there is no
    // half-finished order to clean up — they can simply try again.
    console.error(`[payment/create] Could not open checkout for order=${orderId}:`, err);
    return NextResponse.json(
      { error: "checkout_failed", message: "Gagal menghubungi penyedia pembayaran. Coba lagi beberapa saat lagi." },
      { status: 502 },
    );
  }

  try {
    await db.insert(transactions).values({
      id: randomUUID(),
      companyId: dbUser.companyId,
      orderId,
      plan,
      amount: String(amount),
      status: "pending",
      snapToken: snapResponse.token,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      console.error(`[payment/create] Could not record order=${orderId}:`, err);
      return NextResponse.json(
        { error: "checkout_failed", message: "Gagal memulai pembayaran. Coba lagi beberapa saat lagi." },
        { status: 500 },
      );
    }

    // Lost the race. Another request created this company's pending order for
    // this plan between our lookup above and this insert, and
    // transactions_one_pending_per_plan refused the second one — which is the
    // whole point of that index: the lookup is a fast path, this is the rule.
    //
    // The Snap transaction we just opened is abandoned here. That costs nothing:
    // Snap only issues a payment instrument (a virtual account number, a QR)
    // once the customer opens the popup and picks a method, and nobody will ever
    // receive this token. It expires on its own.
    const [winner] = await db.select().from(transactions)
      .where(and(
        eq(transactions.companyId, dbUser.companyId),
        eq(transactions.plan, plan),
        eq(transactions.status, "pending"),
      ))
      .limit(1);

    if (winner?.snapToken) {
      console.log(`[payment/create] Lost the race for a pending order; reusing company=${dbUser.companyId} order=${winner.orderId}`);
      return NextResponse.json({ token: winner.snapToken, orderId: winner.orderId, reused: true });
    }

    if (winner) {
      // A pending order with no token blocks the index but can never be paid —
      // the customer was never given a way to pay it. Close it so the next
      // attempt gets through, instead of leaving checkout permanently wedged
      // for this company.
      console.warn(`[payment/create] Closing tokenless pending order=${winner.orderId} blocking checkout for company=${dbUser.companyId}`);
      await db.update(transactions)
        .set({ status: "expired" })
        .where(and(eq(transactions.id, winner.id), ne(transactions.status, "paid")))
        .catch((e) => console.error(`[payment/create] Could not close order=${winner.orderId}:`, e));
    } else {
      // The violation was the order_id unique constraint, not ours — which the
      // random suffix makes all but impossible. Nothing to recover from.
      console.error(`[payment/create] Unique violation on order=${orderId} with no pending order to fall back on:`, err);
    }

    return NextResponse.json(
      { error: "checkout_retry", message: "Gagal memulai pembayaran. Silakan coba sekali lagi." },
      { status: 409 },
    );
  }

  return NextResponse.json({ token: snapResponse.token, orderId });
}
