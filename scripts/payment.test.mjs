import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { DrizzleQueryError, eq } from "drizzle-orm";
import { db, pg, state } from "./payment-test-fixture.mjs";
import { companies, transactions } from "../src/lib/db/schema.ts";
import { recordCheckout, isUniqueViolation } from "../src/lib/payment-checkout.ts";
import { settlePaidOrder } from "../src/lib/payment.ts";
import { POST as verify } from "../src/app/api/payment/verify/route.ts";
import { POST as webhook } from "../src/app/api/payment/webhook/route.ts";
import { POST as create } from "../src/app/api/payment/create/route.ts";

await pg.exec("CREATE UNIQUE INDEX pending_plan ON transactions(company_id, plan) WHERE status = 'pending'");
const companyId = randomUUID();
await db.insert(companies).values({ id: companyId, name: "Payment test" });
state.user = { id: "admin", companyId, accountType: "company", name: "Admin", email: "admin@example.invalid" };
const order = (plan = "professional") => ({ id: randomUUID(), orderId: randomUUID(), companyId, plan, amount: plan === "enterprise" ? "4500000" : "1500000", snapToken: randomUUID() });
const first = order();
const second = order("enterprise");
const simultaneous = await Promise.all([recordCheckout(first), recordCheckout(second)]);
assert.equal(simultaneous.filter(r => r.result === "created").length, 1);
assert.equal(simultaneous.filter(r => r.result === "pending").length, 1);
assert.equal((await db.select().from(transactions)).length, 1);
console.log("PASS concurrent different-plan checkouts expose only one recorded order");

let wrapped;
try { await db.insert(transactions).values(order()); } catch (error) { wrapped = error; }
assert.ok(wrapped instanceof DrizzleQueryError);
assert.equal(isUniqueViolation(wrapped), true);
assert.equal(isUniqueViolation({ code: "23505" }), true);
assert.equal(isUniqueViolation(new Error("connection failed")), false);
const cycle = {}; cycle.cause = cycle;
assert.equal(isUniqueViolation(cycle), false);
console.log("PASS real Drizzle unique violation, raw driver error, unrelated error, cyclic cause");

await db.update(companies).set({ plan: "enterprise", planExpiresAt: new Date("2090-01-01") }).where(eq(companies.id, companyId));
const [tx] = await db.select().from(transactions);
assert.equal((await settlePaidOrder(tx, "[test]")).result, "nothing-granted");
assert.equal((await settlePaidOrder(tx, "[test]")).result, "nothing-granted");
assert.equal((await db.select().from(transactions))[0].status, "paid_review");
assert.equal((await db.select().from(companies))[0].planExpiresAt.toISOString(), "2090-01-01T00:00:00.000Z");
globalThis.fetch = async () => Response.json({ transaction_status: "settlement", gross_amount: tx.amount });
const request = () => new Request("https://test.invalid/api/payment/verify", { method: "POST", body: JSON.stringify({ plan: tx.plan, orderId: tx.orderId }) });
for (let i = 0; i < 2; i++) {
  const response = await verify(request());
  const body = await response.json();
  assert.equal(body.upgraded, false);
  assert.equal(body.status, "paid_review");
}
// Later cancellation cannot erase the review outcome or enable another grant.
globalThis.fetch = async () => Response.json({ transaction_status: "cancel" });
await verify(request());
assert.equal((await db.select().from(transactions))[0].status, "paid_review");
for (const transaction_status of ["pending", "expire", "settlement"]) {
  const notification = { order_id: tx.orderId, status_code: "200", gross_amount: tx.amount, transaction_status };
  notification.signature_key = createHash("sha512").update(tx.orderId + "200" + tx.amount + "test-only").digest("hex");
  globalThis.fetch = async () => Response.json({ transaction_status: "settlement", gross_amount: tx.amount });
  const response = await webhook(new Request("https://test.invalid/api/payment/webhook", { method: "POST", body: JSON.stringify(notification) }));
  assert.equal(response.status, 200);
  assert.equal((await db.select().from(transactions).where(eq(transactions.id, tx.id)))[0].status, "paid_review");
}
console.log("PASS review outcome persists across duplicate settlement, verify and delayed webhooks");

await db.update(companies).set({ plan: "starter", planExpiresAt: null }).where(eq(companies.id, companyId));
assert.equal((await settlePaidOrder(tx, "[test]")).result, "nothing-granted");
assert.equal((await db.select().from(companies))[0].plan, "starter");
assert.equal((await db.select().from(companies))[0].planExpiresAt, null);
console.log("PASS reviewed payment cannot grant later after the higher plan ends");
const paid = order();
await db.insert(transactions).values(paid);
const [paidRow] = await db.select().from(transactions).where(eq(transactions.id, paid.id));
assert.equal((await settlePaidOrder(paidRow, "[test]")).result, "granted");
const expiry = (await db.select().from(companies))[0].planExpiresAt.toISOString();
assert.equal((await settlePaidOrder(paidRow, "[test]")).result, "duplicate");
assert.equal((await db.select().from(companies))[0].planExpiresAt.toISOString(), expiry);
console.log("PASS normal payment grants exactly once");

// An old pending token must be checked/closed, never blindly reused or block
// replacement via an unhandled unique violation.
const stale = order();
await db.insert(transactions).values({ ...stale, createdAt: new Date(Date.now() - 25 * 3600_000) });
globalThis.fetch = async (url) => String(url).endsWith('/status')
  ? Response.json({ transaction_status: "expire" })
  : Response.json({ token: "fresh-token", redirect_url: "https://test.invalid/snap" });
const created = await create(new Request("https://test.invalid/api/payment/create", { method: "POST", body: JSON.stringify({ plan: "professional" }) }));
assert.equal(created.status, 200);
assert.equal((await created.json()).token, "fresh-token");
assert.equal((await db.select().from(transactions).where(eq(transactions.id, stale.id)))[0].status, "expired");
console.log("PASS checkout replaces expired pending order with fresh token");

// Drive both real route handlers past their initial lookup before either may
// save its token. This reproduces the original check-then-insert race.
async function concurrentCheckout(plans) {
  await db.update(transactions).set({ status: "expired" }).where(eq(transactions.status, "pending"));
  await db.update(companies).set({ plan: "starter", planExpiresAt: null }).where(eq(companies.id, companyId));
  let arrivals = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith("/transactions"));
    const token = "concurrent-" + (++arrivals);
    if (arrivals === 2) release();
    await barrier;
    return Response.json({ token, redirect_url: "https://test.invalid/snap" });
  };
  const responses = await Promise.all(plans.map(plan => create(new Request("https://test.invalid/api/payment/create", {
    method: "POST", body: JSON.stringify({ plan }),
  }))));
  return Promise.all(responses.map(async response => ({ status: response.status, body: await response.json() })));
}
const differentPlans = await concurrentCheckout(["professional", "enterprise"]);
assert.deepEqual(differentPlans.map(r => r.status).sort(), [200, 409]);
assert.equal(differentPlans.filter(r => r.body.token).length, 1);
assert.equal((await db.select().from(transactions).where(eq(transactions.status, "pending"))).length, 1);
console.log("PASS real concurrent checkout routes for different plans return only one payable token");
const samePlan = await concurrentCheckout(["professional", "professional"]);
assert.deepEqual(samePlan.map(r => r.status), [200, 200]);
assert.equal(samePlan[0].body.token, samePlan[1].body.token);
assert.equal(samePlan[0].body.orderId, samePlan[1].body.orderId);
console.log("PASS real concurrent same-plan checkouts reuse the winning token");

// Snap's 404 means no method chosen, not a revoked token. Do not issue another
// plan alongside an existing page, including tokens older than our reuse window.
await db.update(transactions).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(transactions.status, "pending"));
let snapCalls = 0;
globalThis.fetch = async (url) => {
  if (String(url).endsWith("/status")) return Response.json({}, { status: 404 });
  snapCalls++;
  throw new Error("Must not create another Snap token");
};
const blocked = await create(new Request("https://test.invalid/api/payment/create", {
  method: "POST", body: JSON.stringify({ plan: "enterprise" }),
}));
assert.equal(blocked.status, 409);
assert.equal(snapCalls, 0);
console.log("PASS unregistered but potentially live Snap page blocks a second checkout");

// A tokenless historical row can be retired after Midtrans confirms no order.
await db.update(transactions).set({ snapToken: null }).where(eq(transactions.status, "pending"));
globalThis.fetch = async (url) => String(url).endsWith("/status")
  ? Response.json({}, { status: 404 })
  : Response.json({ token: "recovered-tokenless", redirect_url: "https://test.invalid/snap" });
const recovered = await create(new Request("https://test.invalid/api/payment/create", {
  method: "POST", body: JSON.stringify({ plan: "professional" }),
}));
assert.equal(recovered.status, 200);
assert.equal((await recovered.json()).token, "recovered-tokenless");
console.log("PASS tokenless historical pending order does not wedge checkout");
await pg.close();
