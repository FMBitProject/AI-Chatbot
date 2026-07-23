// Verifies the tenant-isolation RLS added in drizzle/0004_row_level_security.sql
// actually isolates data between two tenants. Run this BEFORE applying that
// migration to production — its failure mode is silent (queries return empty),
// so "the app still works" proves nothing without this check.
//
// ONLY run against a THROWAWAY Neon branch, never production:
//   1. Neon console → your project → Branches → New branch (from main).
//   2. Copy the branch's connection string.
//   3. Apply the migration to the branch:
//        DATABASE_URL=<branch-url> node --env-file=/dev/null node_modules/.bin/drizzle-kit migrate
//   4. Run this script:
//        DATABASE_URL=<branch-url> node scripts/verify-rls.mjs
//   5. All checks PASS → safe to ship (deploy code first, then migrate prod).
//      Delete the Neon branch afterwards.
//
// The script seeds two disposable companies (+1 document, +1 chunk each),
// exercises the policies from both sides, and cleans up after itself.
import { Pool, neonConfig } from "@neondatabase/serverless";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

function fromEnvFile(key) {
  try {
    const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
    }
  } catch {}
  return undefined;
}

const DATABASE_URL = process.env.DATABASE_URL || fromEnvFile("DATABASE_URL");
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const pool = new Pool({ connectionString: DATABASE_URL });

// Mirrors withTenant in src/lib/db/tenant.ts: BEGIN → set app.company_id
// (transaction-local) → run queries → COMMIT/ROLLBACK.
async function withCompany(companyId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (companyId !== null) {
      await client.query("select set_config('app.company_id', $1, true)", [companyId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const A = { company: `rls-test-A-${randomUUID()}`, doc: randomUUID(), chunk: randomUUID(), user: randomUUID(), session: randomUUID(), msg: randomUUID() };
const B = { company: `rls-test-B-${randomUUID()}`, doc: randomUUID(), chunk: randomUUID(), user: randomUUID(), session: randomUUID(), msg: randomUUID() };

async function seed() {
  for (const t of [A, B]) {
    // companies + users are not RLS-protected — plain inserts.
    await pool.query(`insert into companies (id, name) values ($1, $1)`, [t.company]);
    await pool.query(
      `insert into users (id, name, email, company_id) values ($1, 'RLS Test', $2, $3)`,
      [t.user, `${t.user}@rls-test.local`, t.company]);
    // documents/document_chunks/chat_sessions/chat_messages ARE protected:
    // inserts must run with the matching context or WITH CHECK rejects them
    // (itself part of the test). chat_messages has no company_id — its policy
    // checks session_id belongs to a session visible for the context.
    await withCompany(t.company, async (c) => {
      await c.query(
        `insert into documents (id, name, company_id, status) values ($1, 'rls-test.pdf', $2, 'success')`,
        [t.doc, t.company]);
      await c.query(
        `insert into document_chunks (id, document_id, company_id, text, chunk_index) values ($1, $2, $3, 'rls test chunk', 0)`,
        [t.chunk, t.doc, t.company]);
      await c.query(
        `insert into chat_sessions (id, user_id, company_id, title) values ($1, $2, $3, 'rls test session')`,
        [t.session, t.user, t.company]);
      await c.query(
        `insert into chat_messages (id, session_id, role, content) values ($1, $2, 'user', 'rls test question')`,
        [t.msg, t.session]);
    });
  }
}

async function cleanup() {
  for (const t of [A, B]) {
    await withCompany(t.company, async (c) => {
      await c.query(`delete from chat_sessions where id = $1`, [t.session]); // messages cascade
      await c.query(`delete from documents where id = $1`, [t.doc]); // chunks cascade
    }).catch(() => {});
    await pool.query(`delete from users where id = $1`, [t.user]).catch(() => {});
    await pool.query(`delete from companies where id = $1`, [t.company]).catch(() => {});
  }
}

async function main() {
  console.log("== RLS verification ==\n");

  // -- Preflight: does the connected role even respect RLS? -------------------
  // Neon console roles (neondb_owner etc.) are members of neon_superuser, which
  // has BYPASSRLS: policies exist but are silently ignored. The app (and this
  // script) must connect as a plain SQL-created role — see create-rls-role.mjs.
  const { rows: [who] } = await pool.query(
    `select current_user as usr, rolbypassrls, rolsuper
     from pg_roles where rolname = current_user`);
  console.log("Preflight:");
  check(`connected as '${who.usr}' — role does NOT bypass RLS`,
    who.rolbypassrls === false && who.rolsuper === false,
    "this role ignores RLS entirely; run scripts/create-rls-role.mjs and re-run with the printed URL");
  if (failed > 0) {
    console.log("\nVerifying as a BYPASSRLS role proves nothing. Aborting.");
    process.exit(1);
  }

  // -- Preflight: is the migration actually applied? --------------------------
  const rlsTables = ["documents", "document_chunks", "chat_sessions", "chat_messages"];
  const inList = rlsTables.map((t) => `'${t}'`).join(", ");
  const { rows: rls } = await pool.query(`
    select relname, relrowsecurity, relforcerowsecurity
    from pg_class where relname in (${inList})`);
  const { rows: policies } = await pool.query(`
    select tablename, policyname from pg_policies where tablename in (${inList})`);

  for (const name of rlsTables) {
    const row = rls.find((r) => r.relname === name);
    const pol = policies.find((p) => p.tablename === name);
    check(`${name}: RLS enabled`, row?.relrowsecurity === true);
    check(`${name}: RLS FORCED (owner not exempt)`, row?.relforcerowsecurity === true);
    check(`${name}: tenant policy exists`, Boolean(pol), "apply migrations 0004 + 0005 to this branch first");
  }
  if (failed > 0) {
    console.log("\nMigrations 0004/0005 are not (fully) applied to this database. Aborting before seeding.");
    process.exit(1);
  }

  console.log("\nSeeding two throwaway tenants…");
  await seed();

  try {
    console.log("\nIsolation checks:");

    // 1. No context at all → fail closed (0 rows), not fail open.
    const noCtx = await withCompany(null, (c) =>
      c.query(`select id from documents where id in ($1, $2)`, [A.doc, B.doc]));
    check("no tenant context → 0 documents visible (fail closed)", noCtx.rows.length === 0,
      `saw ${noCtx.rows.length} rows`);

    // 2. Context A sees exactly A's data.
    const aDocs = await withCompany(A.company, (c) =>
      c.query(`select id from documents where id in ($1, $2)`, [A.doc, B.doc]));
    check("tenant A sees own document", aDocs.rows.some((r) => r.id === A.doc));
    check("tenant A cannot see B's document (even by exact id)", !aDocs.rows.some((r) => r.id === B.doc));

    const aChunks = await withCompany(A.company, (c) =>
      c.query(`select id from document_chunks where id in ($1, $2)`, [A.chunk, B.chunk]));
    check("tenant A sees own chunk", aChunks.rows.some((r) => r.id === A.chunk));
    check("tenant A cannot see B's chunk", !aChunks.rows.some((r) => r.id === B.chunk));

    // 3. The dangerous case RLS exists for: a query that FORGOT its WHERE
    //    company_id clause must still only return the current tenant's rows.
    const forgot = await withCompany(A.company, (c) =>
      c.query(`select company_id from documents where name = 'rls-test.pdf'`));
    check("forgotten WHERE company_id still returns only tenant A rows",
      forgot.rows.length === 1 && forgot.rows[0].company_id === A.company,
      `saw companies: ${[...new Set(forgot.rows.map((r) => r.company_id))].join(", ")}`);

    // 4. Cross-tenant INSERT rejected by WITH CHECK.
    let insertRejected = false;
    try {
      await withCompany(A.company, (c) =>
        c.query(`insert into documents (id, name, company_id, status) values ($1, 'evil.pdf', $2, 'success')`,
          [randomUUID(), B.company]));
    } catch (err) {
      insertRejected = /row-level security|policy/i.test(String(err.message));
    }
    check("tenant A cannot INSERT a row for tenant B (WITH CHECK)", insertRejected);

    // 5. Cross-tenant UPDATE / DELETE silently affect 0 rows.
    const upd = await withCompany(A.company, (c) =>
      c.query(`update documents set name = 'hacked.pdf' where id = $1`, [B.doc]));
    check("tenant A UPDATE on B's document affects 0 rows", upd.rowCount === 0);

    const del = await withCompany(A.company, (c) =>
      c.query(`delete from documents where id = $1`, [B.doc]));
    check("tenant A DELETE on B's document affects 0 rows", del.rowCount === 0);

    const bStill = await withCompany(B.company, (c) =>
      c.query(`select name from documents where id = $1`, [B.doc]));
    check("B's document survived A's attack, name intact",
      bStill.rows.length === 1 && bStill.rows[0].name === "rls-test.pdf");

    // 6. set_config is transaction-local: the same pooled connection, next
    //    transaction, must NOT inherit A's context.
    const afterTx = await withCompany(null, (c) =>
      c.query(`select id from documents where id = $1`, [A.doc]));
    check("tenant context does not leak across transactions on a pooled connection",
      afterTx.rows.length === 0);

    // 7. Own-tenant delete works, and the FK cascade clears chunks.
    const ownDel = await withCompany(A.company, (c) =>
      c.query(`delete from documents where id = $1`, [A.doc]));
    check("tenant A can delete own document", ownDel.rowCount === 1);
    const aChunksAfter = await withCompany(A.company, (c) =>
      c.query(`select id from document_chunks where document_id = $1`, [A.doc]));
    check("chunk cascade-delete fired", aChunksAfter.rows.length === 0);

    // -- chat_sessions + chat_messages (phase 2) ------------------------------
    console.log("\nChat-history isolation checks:");

    // No context → nothing visible.
    const noCtxS = await withCompany(null, (c) =>
      c.query(`select id from chat_sessions where id in ($1, $2)`, [A.session, B.session]));
    check("no context → 0 chat_sessions visible (fail closed)", noCtxS.rows.length === 0);

    // Context A sees own session/message, never B's.
    const aSess = await withCompany(A.company, (c) =>
      c.query(`select id from chat_sessions where id in ($1, $2)`, [A.session, B.session]));
    check("tenant A sees own chat_session", aSess.rows.some((r) => r.id === A.session));
    check("tenant A cannot see B's chat_session", !aSess.rows.some((r) => r.id === B.session));

    // chat_messages has no company_id — isolation comes from the session subquery.
    const aMsgs = await withCompany(A.company, (c) =>
      c.query(`select id from chat_messages where id in ($1, $2)`, [A.msg, B.msg]));
    check("tenant A sees own chat_message", aMsgs.rows.some((r) => r.id === A.msg));
    check("tenant A cannot see B's chat_message (scoped via session subquery)",
      !aMsgs.rows.some((r) => r.id === B.msg));

    // Forgotten WHERE on chat_sessions still returns only A.
    const forgotS = await withCompany(A.company, (c) =>
      c.query(`select company_id from chat_sessions where title = 'rls test session'`));
    check("forgotten WHERE on chat_sessions returns only tenant A",
      forgotS.rows.length === 1 && forgotS.rows[0].company_id === A.company);

    // Cross-tenant INSERTs rejected by WITH CHECK.
    let sessInsertRejected = false;
    try {
      await withCompany(A.company, (c) =>
        c.query(`insert into chat_sessions (id, user_id, company_id, title) values ($1, $2, $3, 'evil')`,
          [randomUUID(), A.user, B.company]));
    } catch (err) { sessInsertRejected = /row-level security|policy/i.test(String(err.message)); }
    check("tenant A cannot INSERT a chat_session for tenant B", sessInsertRejected);

    let msgInsertRejected = false;
    try {
      await withCompany(A.company, (c) =>
        c.query(`insert into chat_messages (id, session_id, role, content) values ($1, $2, 'user', 'evil')`,
          [randomUUID(), B.session])); // B's session under A's context
    } catch (err) { msgInsertRejected = /row-level security|policy/i.test(String(err.message)); }
    check("tenant A cannot INSERT a chat_message into B's session (subquery WITH CHECK)", msgInsertRejected);

    // Cross-tenant UPDATE/DELETE affect 0 rows; B's data survives.
    const updS = await withCompany(A.company, (c) =>
      c.query(`update chat_sessions set title = 'hacked' where id = $1`, [B.session]));
    check("tenant A UPDATE on B's chat_session affects 0 rows", updS.rowCount === 0);

    const delM = await withCompany(A.company, (c) =>
      c.query(`delete from chat_messages where id = $1`, [B.msg]));
    check("tenant A DELETE on B's chat_message affects 0 rows", delM.rowCount === 0);

    const bSessStill = await withCompany(B.company, (c) =>
      c.query(`select title from chat_sessions where id = $1`, [B.session]));
    check("B's chat_session survived A's attack, title intact",
      bSessStill.rows.length === 1 && bSessStill.rows[0].title === "rls test session");
  } finally {
    console.log("\nCleaning up test tenants…");
    await cleanup();
    await pool.end();
  }

  console.log(`\n== Result: ${passed} passed, ${failed} failed ==`);
  if (failed > 0) {
    console.log("DO NOT apply the migration to production until every check passes.");
    process.exit(1);
  }
  console.log("RLS isolation verified. Safe to ship: deploy code first, then apply the migration to prod.");
}

main().catch(async (err) => {
  console.error("\nVerification crashed:", err.message);
  await cleanup().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
