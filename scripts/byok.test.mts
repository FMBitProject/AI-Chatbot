import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pg } from "./security-test-db.mjs";
import { parseSettingsInput, mergeSettings, providerSecretContext, settingsRevision, settingsView, type StoredAiSettings } from "../src/lib/ai-settings.ts";
import { loadAiSettings, saveAiSettings, removeAiProvider } from "../src/lib/ai-settings-store.ts";
import { resolveStoredByok } from "../src/lib/byok.ts";
import { isAiSettingsView, PROVIDER_CATALOG } from "../src/lib/ai-providers.ts";
import { INTERACTIVE_CHAIN, usableChain, modelFor } from "../src/lib/models.ts";
import { decryptSecret, encryptSecret } from "../src/lib/secret-box.ts";
import { AppError } from "../src/lib/errors.ts";
import { NextRequest } from "next/server";
import { GET, PUT } from "../src/app/api/admin/ai-providers/route.ts";
import { GET as getCompany } from "../src/app/api/admin/company/route.ts";
import { POST as testConnection } from "../src/app/api/admin/ai-providers/test/route.ts";
import { authState } from "./byok-test-auth.mjs";

process.env.BYOK_SECRET_KEY = Buffer.alloc(32, 17).toString("base64");
process.env.GROQ_API_KEY = "platform-groq-must-not-be-used";
process.env.GOOGLE_GENERATIVE_AI_API_KEY = "platform-google-must-not-be-used";
const empty: StoredAiSettings = { primary: null, fallback: null, legacy: false, providers: [] };
const model = (p: keyof typeof PROVIDER_CATALOG) => PROVIDER_CATALOG[p].models[0];
const input = { primary: "anthropic", fallback: "openai", providers: [
  { provider: "anthropic", model: model("anthropic"), apiKey: "own-anthropic" },
  { provider: "openai", model: model("openai"), apiKey: "own-openai" },
  { provider: "google", model: model("google"), apiKey: "own-google" },
] };
try {
  for (const invalid of [
    {}, { ...input, primary: undefined }, { ...input, providers: null },
    { ...input, providers: [null] }, { ...input, primary: "untrusted" },
    { ...input, fallback: "anthropic" }, { ...input, primary: null },
    { ...input, providers: [input.providers[0], input.providers[0]] },
    { ...input, providers: [{ ...input.providers[0], apiKey: 12 }] },
    { ...input, providers: [{ ...input.providers[0], apiKey: "  " }] },
    { ...input, providers: [{ ...input.providers[0], apiKey: "a\nb" }] },
    { ...input, providers: [{ ...input.providers[0], model: "foreign-model" }] },
    { ...input, providers: [{ ...input.providers[0], baseURL: "http://internal" }] },
  ]) assert.throws(() => parseSettingsInput(invalid), AppError);

  const parsed = parseSettingsInput(input);
  const own = mergeSettings("a", empty, parsed);
  assert.equal(decryptSecret(own.providers[0].encryptedKey, providerSecretContext("a", "anthropic")), "own-anthropic");
  assert.throws(() => decryptSecret(own.providers[0].encryptedKey, providerSecretContext("b", "anthropic")));
  assert.throws(() => decryptSecret(own.providers[0].encryptedKey, providerSecretContext("a", "openai")));
  assert.ok(isAiSettingsView(settingsView(own)));
  assert.equal(JSON.stringify(settingsView(own)).includes("own-anthropic"), false);
  for (const value of [null, {}, { ...settingsView(own), providers: null },
    { ...settingsView(own), providers: [] }, { ...settingsView(own), primary: "bad" },
    { ...settingsView(own), providers: Array(4).fill(settingsView(own).providers[0]) }]) {
    assert.equal(isAiSettingsView(value), false);
  }
  const keys = resolveStoredByok("a", own);
  assert.deepEqual(usableChain(INTERACTIVE_CHAIN, keys).map(p => p.provider), ["anthropic", "openai"]);
  assert.equal(keys.gemini, "own-google");
  assert.equal(keys.groq, null);
  assert.throws(() => modelFor(INTERACTIVE_CHAIN[0], keys));
  for (const link of keys.chain!) {
    const sdkModel = modelFor(link, keys);
    assert.equal(typeof sdkModel, "object");
    if (typeof sdkModel === "object") assert.equal(sdkModel.specificationVersion, "v3");
  }
  assert.deepEqual(usableChain(INTERACTIVE_CHAIN, { ...keys, anthropic: null, openai: null }), []);
  const platform = mergeSettings("a", own, parseSettingsInput({ primary: null, fallback: null, providers: [] }));
  assert.deepEqual(resolveStoredByok("a", platform), { groq: null, gemini: null });
  assert.equal(platform.providers.length, 3);
  const noGemini = { ...parsed, providers: parsed.providers.filter(p => p.provider !== "google") };
  assert.throws(() => mergeSettings("a", empty, noGemini), (e: unknown) =>
    e instanceof AppError && e.envelope("id").error.message.includes("Gemini"));

  // Run the actual additive migration against temporary PostgreSQL.
  await pg.exec(readFileSync(new URL("../drizzle/0021_bumpy_warpath.sql", import.meta.url), "utf8"));
  const groq = encryptSecret("legacy-groq", "a:groqApiKey");
  const google = encryptSecret("legacy-google", "a:geminiApiKey");
  await pg.query("insert into companies (id,name,plan,groq_api_key,gemini_api_key) values ($1,$2,'professional',$3,$4)", ["a", "A", groq, google]);
  await pg.query("insert into companies (id,name,plan,groq_api_key) values ('b','B','professional',$1)", [encryptSecret("b-groq", "b:groqApiKey")]);
  const request = (path: string, body?: unknown, revision?: string) => new NextRequest(`https://byok-test.invalid/api/admin/${path}`, {
    method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(revision ? { "If-Match": `"${revision}"` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // The two exact endpoints from the screenshot resolve after migration.
  assert.equal((await GET(request("ai-providers"))).status, 200);
  assert.equal((await getCompany(request("company"))).status, 200);
  authState.status = "anonymous";
  assert.equal((await GET(request("ai-providers"))).status, 401);
  authState.status = "employee";
  assert.equal((await PUT(request("ai-providers", input))).status, 403);
  authState.status = "admin";
  const initialRevision = settingsRevision(await loadAiSettings("a"));
  const invalidSave = await PUT(request("ai-providers", { ...input, providers: [input.providers[0]] }, initialRevision));
  assert.equal(invalidSave.status, 400);
  assert.equal((await loadAiSettings("a")).legacy, true);
  assert.equal(resolveStoredByok("a", await loadAiSettings("a")).groq, "legacy-groq");
  await removeAiProvider("b", "openai");
  assert.equal((await loadAiSettings("b")).legacy, true, "deleting absent key must not migrate Groq-only configuration");
  await saveAiSettings("a", parsed);
  const staleSave = await PUT(request("ai-providers", { primary: null, fallback: null, providers: [] }, initialRevision));
  assert.equal(staleSave.status, 409);
  await assert.rejects(removeAiProvider("a", "groq", initialRevision), AppError);
  assert.equal((await loadAiSettings("a")).primary, "anthropic", "stale saves must not overwrite routing");
  assert.equal((await loadAiSettings("a")).legacy, false);
  assert.equal(resolveStoredByok("a", await loadAiSettings("a")).anthropic, "own-anthropic");
  const legacy = (await pg.query<{ groq_api_key: string | null; gemini_api_key: string | null }>("select groq_api_key,gemini_api_key from companies where id='a'")).rows[0];
  assert.equal(legacy.groq_api_key, null); assert.equal(legacy.gemini_api_key, null);
  const keep = await saveAiSettings("a", parseSettingsInput({ primary: "anthropic", fallback: null,
    providers: [{ provider: "anthropic", model: model("anthropic") }] }));
  assert.equal(resolveStoredByok("a", keep).anthropic, "own-anthropic", "omitted key is retained");
  await assert.rejects(removeAiProvider("a", "google"), (e: unknown) => e instanceof AppError && e.envelope("id").error.message.includes("mode platform"));
  await assert.rejects(saveAiSettings("a", parseSettingsInput({ primary: "anthropic", fallback: null,
    providers: [{ provider: "google", model: model("google"), apiKey: null }] })), AppError);
  assert.equal(resolveStoredByok("a", await loadAiSettings("a")).gemini, "own-google", "invalid save must roll back");

  // Gemini configured only for embedding must not require generation access.
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "own-google");
    if (String(url).includes("embedContent")) return Response.json({ embedding: { values: Array(1536).fill(0.1) } });
    return Response.json({ error: { message: "Generation access denied", code: 403 } }, { status: 403 });
  };
  const embeddingTest = await testConnection(request("ai-providers/test", {
    provider: "google", model: model("google"), purpose: "embedding",
  }));
  assert.equal(embeddingTest.status, 200);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes("gemini-embedding-001"));
  const failedTest = await testConnection(request("ai-providers/test", {
    provider: "google", model: model("google"), purpose: "both",
  }));
  assert.equal(failedTest.status, 502);
  assert.equal(JSON.stringify(await failedTest.json()).includes("own-google"), false);
  globalThis.fetch = async () => { throw new Error("Network disabled"); };

  // Forced RLS under a non-superuser: no context and wrong company fail closed.
  await pg.exec("CREATE ROLE byok_rls_test; GRANT SELECT, INSERT, UPDATE, DELETE ON company_ai_settings, company_ai_providers TO byok_rls_test; SET ROLE byok_rls_test");
  assert.equal((await pg.query("select * from company_ai_providers")).rows.length, 0);
  await pg.query("select set_config('app.company_id','b',false)");
  assert.equal((await pg.query("select * from company_ai_providers where company_id='a'")).rows.length, 0);
  await assert.rejects(pg.query("insert into company_ai_settings(company_id) values ('a')"));
  await pg.query("select set_config('app.company_id','a',false)");
  assert.ok((await pg.query("select * from company_ai_providers")).rows.length > 0);
  await pg.exec("RESET ROLE");
  delete process.env.BYOK_SECRET_KEY;
  await saveAiSettings("a", parseSettingsInput({ primary: null, fallback: null, providers: [] }));
  await removeAiProvider("a", "anthropic");
  assert.equal((await loadAiSettings("a")).providers.some(p => p.provider === "anthropic"), false,
    "disable and delete work without the encryption master key");
  console.log("BYOK tests passed: validation, encryption, routing, legacy migration, rollback, deletion, response shape and tenant RLS.");
} finally { await pg.close(); }
