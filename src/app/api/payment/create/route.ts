import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies, transactions } from "@/lib/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import {
  amountMatches,
  closedTransactionStatus,
  createSnapTransaction,
  fetchMidtransStatus,
  isSettledStatus,
} from "@/lib/midtrans";
import { settlePaidOrder } from "@/lib/payment";
import { alertOps } from "@/lib/alerts";
import { getPlanPrice, PLAN_NAMES, isPurchasablePlan, planRank, planRankInForce } from "@/lib/pricing";
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
// normal case; more than one only exists as leftovers from before reuse was
// added. Capped because each one costs an outbound request on a path the
// customer is waiting on.
const MAX_PENDING_TO_CHECK = 3;

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
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = consumeRateLimit(`payment-create:${dbUser.id}`, CREATE_LIMIT);
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

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Block buying a lower tier while a paid subscription is still active — a
  // downgrade would strip time the customer already paid for. They can switch
  // once the current period lapses. Renewals (same tier) and upgrades are fine.
  if (planRank(plan) < planRankInForce(company.plan, company.planExpiresAt)) {
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
  // Several are fetched, not one, because there may already *be* several: every
  // checkout before this guard existed minted its own order, so a company can
  // carry more than one live at once. Looking only at the newest would settle
  // or close that one, find nothing else, and mint yet another alongside the
  // older ones still standing. Newest first — those have the most token life
  // left and are the likeliest to still be payable.
  const pendings = await db.select().from(transactions)
    .where(and(
      eq(transactions.companyId, dbUser.companyId),
      eq(transactions.plan, plan),
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

      return NextResponse.json(
        {
          error: "already_paid",
          message: "Pembayaran Anda untuk paket ini sudah kami terima. Silakan buka dashboard untuk melihat status langganan.",
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
    const reusable = checked.find(
      (c) =>
        c.order.snapToken !== null &&
        (!c.status.ok || !closedTransactionStatus(c.status.data.transaction_status)),
    );
    if (reusable?.order.snapToken) {
      console.log(`[payment/create] Reusing pending order: company=${dbUser.companyId} order=${reusable.order.orderId}`);
      return NextResponse.json({ token: reusable.order.snapToken, orderId: reusable.order.orderId, reused: true });
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
