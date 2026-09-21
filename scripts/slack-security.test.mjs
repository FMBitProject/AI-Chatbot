// Run with the existing security-test hook: real auth, SQL, encryption and
// route handlers; external Slack/AI calls and Next's after scheduler are fake.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const fixtureUrl = new URL("./security-test-db.mjs", import.meta.url).href;
const nextUrl = pathToFileURL(createRequire(import.meta.url).resolve("next/server")).href;
const state = globalThis.slackSecurityFixture = {
  teamId: "T-FIRST", exchanges: 0, jobs: [], messages: [], answers: [], failDelivery: false,
};
const mocks = {
  "next/server": `import * as actual from ${JSON.stringify(nextUrl)};
    export const NextRequest = actual.NextRequest, NextResponse = actual.NextResponse;
    export function after(job) { globalThis.slackSecurityFixture.jobs.push(job); }`,
  "@/lib/db/transaction": `import { db } from ${JSON.stringify(fixtureUrl)};
    export function withTransaction(fn) { return db.transaction(fn); }`,
  "@slack/web-api": `export class WebClient {
    oauth = {v2: {access: async () => {
      const s = globalThis.slackSecurityFixture; s.exchanges++;
      return {access_token: "test-only-bot-token", team: {id: s.teamId, name: "Test workspace"}};
    }}};
    users = {info: async () => { throw new Error("Unexpected Slack profile lookup"); }};
    chat = {
      postMessage: async (message) => {
        globalThis.slackSecurityFixture.messages.push({method: "postMessage", ...message});
        throw new Error("Public posting is forbidden");
      },
      postEphemeral: async (message) => {
        const s = globalThis.slackSecurityFixture;
        s.messages.push({method: "postEphemeral", ...message});
        if (s.failDelivery) throw new Error("Simulated private delivery failure");
        return {ok: true};
      },
    };
  }`,
  "@/lib/byok": `export async function resolveByok() { return {ok: true, gemini: "test", groq: "test"}; }
    export function billsOwnProvider() { return false; }`,
  "@/lib/slack-answer": `export async function answerForSlack(options) {
      globalThis.slackSecurityFixture.answers.push(options);
      return {text: "Restricted HR answer", sources: ["HR-only document"]};
    }
    export function formatSlackAnswer(answer) { return answer.text; }`,
};
registerHooks({
  resolve(spec, context, next) {
    if (mocks[spec]) return {url: `data:text/javascript,${encodeURIComponent(mocks[spec])}`, shortCircuit: true};
    return next(spec, context);
  },
});
process.env.BYOK_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.SLACK_CLIENT_ID = "test-only-client";
process.env.SLACK_CLIENT_SECRET = "test-only-secret";
process.env.SLACK_SIGNING_SECRET = "test-only-signing-secret";
const origin = process.env.BETTER_AUTH_URL;
const { pg } = await import("./security-test-db.mjs");
const { NextRequest } = await import("next/server");
const { auth } = await import("../src/lib/auth.ts");
const { createCredentialAccount } = await import("../src/lib/credential-account.ts");
const { encryptSecret, decryptSecret } = await import("../src/lib/secret-box.ts");
const {
  readSlackInstallState, issueSlackInstallState, SLACK_INSTALL_STATE_CONTEXT,
} = await import("../src/lib/slack-install-state.ts");
const { GET: install } = await import("../src/app/api/slack/install/route.ts");
const { GET: callback } = await import("../src/app/api/slack/oauth/callback/route.ts");
const { POST: command } = await import("../src/app/api/slack/command/route.ts");
const { POST: events } = await import("../src/app/api/slack/events/route.ts");
const password = "Security-test-password-123!";
const status = response => new URL(response.headers.get("location")).searchParams.get("slack");
const cookieOf = response => response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
async function login(user) {
  const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: {origin, "content-type": "application/json"},
    body: JSON.stringify({email: user.email, password}),
  }));
  assert.equal(response.status, 200);
  return cookieOf(response);
}
function callbackRequest(flow, sessionCookie = "", nonce = flow.nonce) {
  return new NextRequest(`${origin}/api/slack/oauth/callback?${new URLSearchParams({code: "test-code", state: flow.state})}`, {
    headers: {cookie: `${sessionCookie}; slack_install_nonce=${nonce}`},
  });
}
function signedRequest(path, body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "v0=" + createHmac("sha256", process.env.SLACK_SIGNING_SECRET)
    .update(`v0:${timestamp}:${body}`).digest("hex");
  return new NextRequest(`${origin}/api/slack/${path}`, {method: "POST", body, headers: {
    "x-slack-request-timestamp": timestamp, "x-slack-signature": signature,
  }});
}
async function drain() {
  for (const job of state.jobs.splice(0)) await job();
}

try {
  await pg.exec(`CREATE TABLE slack_installations (
    team_id text PRIMARY KEY, company_id text NOT NULL UNIQUE REFERENCES companies(id),
    team_name text, bot_token text NOT NULL, bot_user_id text, scopes text,
    installed_by_user_id text REFERENCES users(id), installed_at timestamp DEFAULT now() NOT NULL
  )`);
  const admin = await createCredentialAccount({name: "Admin", email: "admin@example.com", password,
    companyId: "company-a", role: "admin", emailVerified: true, workspace: {name: "A", accountType: "company"}});
  const other = await createCredentialAccount({name: "Other", email: "other@example.com", password,
    companyId: "company-b", role: "admin", emailVerified: true, workspace: {name: "B", accountType: "company"}});
  const employee = await createCredentialAccount({name: "HR", email: "hr@example.com", password,
    companyId: admin.companyId, role: "employee", department: "HR", emailVerified: true});
  await pg.exec("update companies set plan='professional'; update users set slack_user_id='U-HR' where email='hr@example.com'");
  const adminCookie = await login(admin), otherCookie = await login(other), employeeCookie = await login(employee);
  assert.equal(status(await install(new NextRequest(`${origin}/api/slack/install`))), "error");
  const start = await install(new NextRequest(`${origin}/api/slack/install`, {headers: {cookie: adminCookie}}));
  const first = {state: new URL(start.headers.get("location")).searchParams.get("state"),
    nonce: start.cookies.get("slack_install_nonce").value};
  const decoded = readSlackInstallState(first.state, first.nonce);
  assert.equal(decoded.companyId, admin.companyId);
  assert.equal(status(await callback(callbackRequest({...first, state: JSON.stringify(decoded)}, adminCookie))), "error");
  assert.equal(status(await callback(callbackRequest(first))), "error");
  assert.equal(status(await callback(callbackRequest(first, otherCookie))), "error");
  assert.equal(status(await callback(callbackRequest(first, employeeCookie))), "error");
  assert.equal(status(await callback(callbackRequest(first, adminCookie, "x".repeat(43)))), "error");
  for (const malformed of [null, [], {...decoded, exp: Date.now() - 1}, {...decoded, exp: 1e100}]) {
    const bad = encryptSecret(JSON.stringify(malformed), SLACK_INSTALL_STATE_CONTEXT);
    assert.equal(status(await callback(callbackRequest({...first, state: bad}, adminCookie))), "error");
  }
  await pg.query("update users set role='admin' where id=$1", [employee.id]);
  assert.equal(status(await callback(callbackRequest(first, employeeCookie))), "error");
  await pg.query("update users set role='employee' where id=$1", [employee.id]);
  await pg.query("update companies set plan='starter' where id=$1", [admin.companyId]);
  assert.equal(status(await callback(callbackRequest(first, adminCookie))), "plan");
  await pg.query("update companies set plan='professional' where id=$1", [admin.companyId]);
  const wrongContext = encryptSecret(JSON.stringify(decoded), "company-a:groqApiKey");
  assert.equal(status(await callback(callbackRequest({...first, state: wrongContext}, adminCookie))), "error");
  const tampered = first.state.split(":");
  const tag = Buffer.from(tampered[2], "base64"); tag[0] ^= 1; tampered[2] = tag.toString("base64");
  assert.equal(status(await callback(callbackRequest({...first, state: tampered.join(":")}, adminCookie))), "error");
  assert.equal(state.exchanges, 0);
  assert.equal(status(await callback(callbackRequest(first, adminCookie))), "connected");
  assert.equal(state.exchanges, 1);
  assert.equal(status(await callback(callbackRequest(first, adminCookie))), "error");
  assert.equal(state.exchanges, 1);
  assert.equal(decryptSecret("legacy-key", "legacy-context"), "legacy-key");

  const race = await issueSlackInstallState(admin);
  const raced = await Promise.all([callback(callbackRequest(race, adminCookie)), callback(callbackRequest(race, adminCookie))]);
  assert.deepEqual(raced.map(status).sort(), ["connected", "error"]);
  assert.equal(state.exchanges, 2);
  const expired = await issueSlackInstallState(admin);
  await pg.query("update verifications set expires_at=now()-interval '1 second' where id=$1", [`slack-install:${expired.nonce}`]);
  assert.equal(status(await callback(callbackRequest(expired, adminCookie))), "error");
  assert.equal(state.exchanges, 2);
  const notIssued = {...decoded, nonce: "z".repeat(43), exp: Date.now() + 60_000};
  assert.equal(status(await callback(callbackRequest({state: encryptSecret(JSON.stringify(notIssued), SLACK_INSTALL_STATE_CONTEXT), nonce: notIssued.nonce}, adminCookie))), "error");

  // Existing ownership survives a rejected replacement, including rollback of
  // the other company's old installation deleted earlier in the transaction.
  state.teamId = "T-SECOND";
  assert.equal(status(await callback(callbackRequest(await issueSlackInstallState(other), otherCookie))), "connected");
  state.teamId = "T-FIRST";
  assert.equal(status(await callback(callbackRequest(await issueSlackInstallState(other), otherCookie))), "taken");
  assert.deepEqual((await pg.query("select team_id,company_id from slack_installations order by team_id")).rows,
    [{team_id: "T-FIRST", company_id: "company-a"}, {team_id: "T-SECOND", company_id: "company-b"}]);
  const revoked = await issueSlackInstallState(other);
  await pg.query("delete from sessions where user_id=$1", [other.id]);
  const exchangesBefore = state.exchanges;
  assert.equal(status(await callback(callbackRequest(revoked, otherCookie))), "error");
  assert.equal(state.exchanges, exchangesBefore);
  console.log("PASS: OAuth plaintext/tampering, auth/tenant/role/revocation, nonce expiry/replay/concurrency, ownership rollback, legacy keys.");

  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://slack-response.invalid/test");
    state.messages.push({method: "response_url", ...JSON.parse(init.body)});
    return new Response("ok");
  };
  const commandBody = new URLSearchParams({team_id: "T-FIRST", user_id: "U-HR", text: "HR policy?", response_url: "https://slack-response.invalid/test"}).toString();
  const ack = await command(signedRequest("command", commandBody));
  assert.equal((await ack.json()).response_type, "ephemeral");
  await drain();
  assert.equal(state.messages.at(-1).response_type, "ephemeral");
  assert(state.messages.at(-1).text.includes("Restricted HR answer"));
  assert.equal(state.answers.at(-1).access.department, "HR");
  const eventBody = JSON.stringify({type: "event_callback", team_id: "T-FIRST", event: {
    type: "app_mention", user: "U-HR", channel: "C-PUBLIC", ts: "123.456", text: "<@U-BOT> HR policy?",
  }});
  await events(signedRequest("events", eventBody)); await drain();
  for (const message of state.messages.filter(m => m.method === "postEphemeral")) {
    assert.equal(message.user, "U-HR"); assert.equal(message.channel, "C-PUBLIC");
  }
  assert.equal(state.messages.at(-1).text, "Restricted HR answer");
  state.failDelivery = true;
  await events(signedRequest("events", eventBody)); await drain();
  assert(state.messages.every(m => m.method !== "postMessage" && m.response_type !== "in_channel"));
  const answered = state.answers.length;
  assert.equal((await events(new NextRequest(`${origin}/api/slack/events`, {method: "POST", body: eventBody}))).status, 401);
  assert.equal(state.jobs.length, 0); assert.equal(state.answers.length, answered);
  console.log("PASS: slash-command and app-mention answers stay private to the authorized user, including delivery failure; unsigned webhooks rejected.");
} finally {
  await pg.close();
  delete globalThis.slackSecurityFixture;
}
