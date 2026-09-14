import assert from "node:assert/strict";
import { pg, db } from "./security-test-db.mjs";
import { state } from "./api-design-test-fixture.mjs";
import { POST as index } from "../src/app/api/admin/indexing/route.ts";
import { POST as query } from "../src/app/api/v1/query/route.ts";
import { companies, apiKeys, users, chatSessions, chatMessages } from "../src/lib/db/schema.ts";
import { GET as messages } from "../src/app/api/chat/sessions/[id]/messages/route.ts";
import { GET as audit } from "../src/app/api/admin/audit/route.ts";
import { eq, sql } from "drizzle-orm";
import { hashApiKey } from "../src/lib/api-key.ts";
import { pagination, paginated } from "../src/lib/pagination.ts";
import { fetchPages, retryDelay, waitForRetry } from "../src/lib/fetch-pages.ts";

const request = (path, body, key, structured = true) => new Request(`https://test.invalid/api/${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...(structured ? { "X-IntelliBase-Error-Format": "structured" } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) }, body,
});
try {
  for (const body of ["{", "null", "[]", "4", '{"documentId":4}', '{"documentId":""}']) {
    assert.equal((await index(request("admin/indexing", body))).status, 400);
  }
  assert.equal(state.indexing, 0);
  assert.deepEqual(state.requeued, []);
  assert.equal((await index(request("admin/indexing", "{}"))).status, 200);
  assert.equal((await index(request("admin/indexing", '{"documentId":"doc-1"}'))).status, 200);
  assert.equal(state.indexing, 2);
  assert.deepEqual(state.requeued, [["api-test", "doc-1"]]);

  await db.insert(companies).values({ id: "api-test", name: "API test" });
  await db.insert(users).values({ id: "api-user", name: "API user", email: "api@example.com", companyId: "api-test" });
  await db.insert(chatSessions).values({ id: "history", companyId: "api-test", userId: "api-user", title: "History" });
  for (const [id, time] of [["z", 2000], ["b", 1000], ["a", 1000]]) {
    await db.insert(chatMessages).values({ id, createdAt: new Date(time), sessionId: "history", role: id === "a" ? "assistant" : "user", content: id });
  }
  const firstPage = await messages(new Request("https://test.invalid/?limit=2"), { params: Promise.resolve({ id: "history" }) });
  assert.deepEqual((await firstPage.json()).map(m => m.id), ["b", "a"]);
  const cursor = firstPage.headers.get("X-Next-Cursor");
  assert.ok(cursor);
  // Deleting a previous record and inserting one before the cursor must not shift the next page.
  await db.delete(chatMessages).where(eq(chatMessages.id, "b"));
  await db.insert(chatMessages).values({ id: "earlier", sessionId: "history", role: "user", content: "earlier", createdAt: new Date(0) });
  const lastPage = await messages(new Request(`https://test.invalid/?limit=2&cursor=${cursor}`), { params: Promise.resolve({ id: "history" }) });
  assert.deepEqual((await lastPage.json()).map(m => m.id), ["z"]);
  assert.equal(lastPage.headers.get("X-Next-Cursor"), null);
  assert.equal((await messages(new Request("https://test.invalid/"), { params: Promise.resolve({ id: "missing" }) })).status, 404);
  for (const key of ["first", "second"]) {
    await db.insert(apiKeys).values({ id: key, name: key, companyId: "api-test", keyHash: hashApiKey(key), keyPrefix: key });
  }
  const assertError = async (response, status, code) => {
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
  };
  const legacyUnauthorized = await query(request("v1/query", "{}", undefined, false));
  assert.deepEqual(await legacyUnauthorized.json(), { error: "Missing API key" });
  await assertError(await query(request("v1/query", "{}")), 401, "UNAUTHORIZED");
  await assertError(await query(request("v1/query", "null", "first")), 400, "VALIDATION_ERROR");
  state.quota = { limit: 300, period: "daily" };
  const quotaResponse = await query(request("v1/query", '{"question":"hi"}', "first"));
  assert.ok(Number(quotaResponse.headers.get("Retry-After")) > 0);
  await assertError(quotaResponse, 429, "QUOTA_EXCEEDED");
  const legacyQuota = await query(request("v1/query", '{"question":"hi"}', "first", false));
  assert.deepEqual(await legacyQuota.json(), { error: "QUOTA_EXCEEDED", limit: 300, period: "daily" });
  state.quota = null;
  state.outage = true;
  await assertError(await query(request("v1/query", '{"question":"hi"}', "first")), 503, "AI_ERROR");
  state.outage = false;
  for (let i = 0; i < 8; i++) {
    await assertError(await query(request("v1/query", "{}", "invalid")), 401, "UNAUTHORIZED");
  }
  const blocked = await query(request("v1/query", "{}", "invalid"));
  assert.ok(Number(blocked.headers.get("Retry-After")) > 0);
  await assertError(blocked, 429, "RATE_LIMITED");
  await pg.exec("delete from verifications where identifier like 'rate-limit:%'");
  const replies = await Promise.all(Array.from({ length: 25 }, (_, i) =>
    query(request("v1/query", '{"question":"hi"}', i % 2 ? "first" : "second"))));
  assert.equal(replies.filter(r => r.status === 200).length, 20);
  assert.equal(state.generated, 20);
  for (const response of replies.filter(r => r.status === 429)) {
    assert.ok(Number(response.headers.get("Retry-After")) > 0);
    await assertError(response, 429, "RATE_LIMITED");
  }

  const keys = [{ column: chatMessages.createdAt, direction: "asc" }, { column: chatMessages.id, direction: "asc" }];
  for (const params of ["limit=0", "limit=101", "offset=0", "cursor=", "cursor=null", "cursor=bad!"]) {
    assert.throws(() => pagination(new Request(`https://test.invalid/?${params}`), keys));
  }
  // Keep sub-millisecond timestamps distinct in continuation tokens.
  await pg.exec("insert into chat_messages(id, session_id, role, content, created_at) values ('micro-a','history','user','a','2026-01-01 00:00:00.000001'),('micro-b','history','user','b','2026-01-01 00:00:00.000002')");
  const microReq = new Request("https://test.invalid/micro?limit=1");
  const microPage = pagination(microReq, keys);
  const microRows = await db.select({ id: chatMessages.id, _cursor: microPage.selection }).from(chatMessages)
    .where(sql`${chatMessages.id} like 'micro-%'`).orderBy(...microPage.order).limit(2);
  const microCursor = paginated(microRows, microPage).headers.get("X-Next-Cursor");
  const afterMicro = pagination(new Request(`https://test.invalid/micro?limit=1&cursor=${microCursor}`), keys);
  const microNext = await db.select({ id: chatMessages.id }).from(chatMessages).where(afterMicro.condition).orderBy(...afterMicro.order).limit(1);
  assert.equal(microNext[0].id, "micro-b");

  // Audit results carry their own role/session; search runs before pagination.
  await db.insert(chatSessions).values({ id: "other-history", companyId: "api-test", userId: "api-user", title: "Other" });
  await db.insert(chatMessages).values({ id: "other-answer", sessionId: "other-history", role: "assistant", content: "unique needle", createdAt: new Date(5000) });
  const searched = await audit(new Request("https://test.invalid/api/admin/audit?limit=1&q=unique%20needle"));
  const found = await searched.json();
  assert.equal(found.length, 1);
  assert.equal(found[0].sessionId, "other-history");
  assert.equal(found[0].role, "assistant");

  const rows = Array.from({ length: 205 }, (_, id) => ({ id: String(id) }));
  const networkDisabled = globalThis.fetch;
  let calls = 0;
  let waits = 0;
  globalThis.fetch = async (url) => {
    if (++calls === 2) return new Response(null, { status: 429, headers: { "Retry-After": "2" } });
    const offset = Number(new URL(url, "https://test.invalid").searchParams.get("cursor") ?? 0);
    return Response.json(rows.slice(offset, offset + 100), { headers: offset + 100 < rows.length ? { "X-Next-Cursor": String(offset + 100) } : {} });
  };
  try {
    assert.deepEqual(await fetchPages("/items", { wait: async (ms) => { assert.equal(ms, 2000); waits++; } }), rows);
    assert.equal(waits, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(fetchPages("/items", { signal: controller.signal }), { name: "AbortError" });
    const waiting = new AbortController();
    const pause = waitForRetry(60_000, waiting.signal);
    waiting.abort();
    await assert.rejects(pause, { name: "AbortError" });
    assert.equal(retryDelay("2"), 2000);
    // An old request must reject even if its transport resolves after cancellation.
    const stale = new AbortController();
    let finish;
    globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
    const obsolete = fetchPages("/old-session", { signal: stale.signal });
    stale.abort();
    finish(Response.json([{ id: "old-message" }]));
    await assert.rejects(obsolete, { name: "AbortError" });
  }
  finally { globalThis.fetch = networkDisabled; }
  console.log("API design passed: indexing validation, public errors, shared burst limit, pagination.");
} finally { await pg.close(); }
