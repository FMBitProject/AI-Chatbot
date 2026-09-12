import assert from "node:assert/strict";
import { pg, db, mail } from "./security-test-db.mjs";
import { createCredentialAccount } from "../src/lib/credential-account.ts";
import { consumeRateLimit, isRateLimited, recordFailure } from "../src/lib/rate-limit.ts";
import { documentAccessCondition } from "../src/lib/document-access.ts";
import { auth } from "../src/lib/auth.ts";
import { documents } from "../src/lib/db/schema.ts";
import { verifyPassword } from "better-auth/crypto";
import { betterAuth } from "better-auth";
import { NextRequest } from "next/server";
import { POST as register } from "../src/app/api/auth/register-admin/route.ts";

const password = "Secure-password-123!";
const origin = "https://security-test.invalid";
const request = (path, body, cookie = "") => new Request(`${origin}/api/auth${path}`, {
  method: body ? "POST" : "GET",
  headers: { origin, "content-type": "application/json", cookie },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const send = (path, body, cookie) => auth.handler(request(path, body, cookie));

try {
  // Concurrent provisioning: exactly one request owns the email/workspace.
  const outcomes = await Promise.allSettled(["one", "two"].map(companyId => createCredentialAccount({
    name: "Owner", email: "OWNER@example.com", password, companyId, role: "admin",
    workspace: { name: companyId, accountType: "company" },
  })));
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const owner = outcomes.find(r => r.status === "fulfilled").value;
  assert.equal((await pg.query("select * from companies")).rows.length, 1);
  const credentials = (await pg.query("select * from accounts")).rows;
  assert.equal(credentials.length, 1);
  assert.notEqual(credentials[0].password, password);
  assert.ok(await verifyPassword({ hash: credentials[0].password, password }));

  // Failure after provisioning retains the account and gives a recovery state.
  mail.fail = true;
  const registration = await register(new NextRequest(`${origin}/api/auth/register-admin`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Delivery", email: "delivery@example.com", password, accountType: "individual" }),
  }));
  assert.equal(registration.status, 200);
  assert.equal((await registration.json()).verificationEmailSent, false);
  assert.equal((await pg.query("select * from users where email='delivery@example.com'")).rows.length, 1);
  mail.fail = false;

  const employee = await createCredentialAccount({
    name: "Employee", email: "employee@example.com", password, companyId: owner.companyId,
    role: "employee", emailVerified: true,
  });
  // Mint the signed session-data cookie used by the previous deployment.
  const legacyAuth = betterAuth({ ...auth.options, session: { cookieCache: { enabled: true, maxAge: 300 } } });
  const login = await legacyAuth.handler(request("/sign-in/email", { email: employee.email, password }));
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  assert.ok(cookie);
  assert.ok(cookie.includes("session_data="));
  for (const body of [{ role: "admin" }, { companyId: "other" }]) {
    const response = await send("/update-user", body, cookie);
    assert.equal(response.status, 400);
  }
  const row = (await pg.query("select role, company_id from users where id=$1", [employee.id])).rows[0];
  assert.equal(row.role, "employee"); assert.equal(row.company_id, owner.companyId);
  assert.notEqual((await send("/sign-up/email", { name: "Intruder", email: "intruder@example.com", password, role: "admin" })).status, 200);
  assert.equal((await pg.query("select * from users where email='intruder@example.com'")).rows.length, 0);

  // Reset policy is server-enforced, and success revokes the existing cookie.
  await pg.query("insert into verifications(id,identifier,value,expires_at) values('reset','reset-password:test-token',$1,now()+interval '1 hour')", [employee.id]);
  assert.equal((await send("/reset-password", { token: "test-token", newPassword: "abcdefgh" })).status, 400);
  assert.notEqual((await send("/reset-password/", { token: "test-token", newPassword: "abcdefgh" })).status, 200);
  assert.equal((await send("/change-password", { currentPassword: password, newPassword: "abcdefgh" }, cookie)).status, 400);
  assert.equal((await send("/reset-password", { token: "test-token", newPassword: "New-password-123!" })).status, 200);
  assert.equal((await pg.query("select * from sessions where user_id=$1", [employee.id])).rows.length, 0);
  assert.equal(await (await send("/get-session", undefined, cookie)).json(), null);

  // Real SQL access predicates, including NULL-department and hostile strings.
  await db.insert(documents).values([null, "HR", "Finance"].map((department, i) => ({
    id: String(i), name: String(i), companyId: owner.companyId, department,
  })));
  for (const [access, expected] of [
    [{ role: "employee", department: null }, 1],
    [{ role: "employee", department: "HR" }, 2],
    [{ role: "employee", department: "' OR 1=1 --" }, 1],
    [{ role: "admin" }, 3],
  ]) {
    assert.equal((await db.select().from(documents).where(documentAccessCondition(access))).length, expected);
  }

  // Shared counters: concurrent attempts, boundary, expiry and auth isolation.
  const rule = { max: 3, windowMs: 60_000 };
  const attempts = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit("concurrent", rule)));
  assert.equal(attempts.filter(r => r.ok).length, 3);
  assert.ok(attempts.filter(r => !r.ok).every(r => r.retryAfter > 0 && r.retryAfter <= 60));
  assert.equal(await isRateLimited("concurrent", rule), true);
  assert.equal(await isRateLimited("fresh", rule), false);
  await Promise.all(Array.from({ length: 3 }, () => recordFailure("failure", rule)));
  assert.equal(await isRateLimited("failure", rule), true);
  await pg.exec("update verifications set expires_at=now()-interval '1 second' where identifier like 'rate-limit:%'");
  assert.equal((await consumeRateLimit("concurrent", rule)).ok, true);
  assert.equal((await pg.query("select * from users where id=$1", [employee.id])).rows.length, 1);
  const authAttempts = await Promise.all(Array.from({ length: 8 }, () => {
    const req = request("/sign-in/email", { email: "missing@example.com", password });
    req.headers.set("x-vercel-forwarded-for", "192.0.2.43");
    return auth.handler(req);
  }));
  assert.equal(authAttempts.filter(r => r.status === 429).length, 3);
  console.log("Security integration passed: provisioning, auth, reset, access, shared rate limits.");
} finally {
  await pg.close();
}
