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

const A = { company: `rls-test-A-${randomUUID()}`, doc: randomUUID(), chunk: randomUUID() };
const B = { company: `rls-test-B-${randomUUID()}`, doc: randomUUID(), chunk: randomUUID() };

async function seed() {
  // companies is not RLS-protected — plain inserts.
  for (const t of [A, B]) {
    await pool.query(`insert into companies (id, name) values ($1, $1)`, [t.company]);
    // documents/document_chunks ARE protected: inserts must run with the
    // matching context or WITH CHECK rejects them (itself part of the test).
    await withCompany(t.company, async (c) => {
      await c.query(
        `insert into documents (id, name, company_id, status) values ($1, 'rls-test.pdf', $2, 'success')`,
        [t.doc, t.company],
      );
      await c.query(
        `insert into document_chunks (id, document_id, company_id, text, chunk_index) values ($1, $2, $3, 'rls test chunk', 0)`,
        [t.chunk, t.doc, t.company],
      );
    });
  }
}

async function cleanup() {
  for (const t of [A, B]) {
    await withCompany(t.company, (c) =>
      c.query(`delete from documents where id = $1`, [t.doc]), // chunks cascade
    ).catch(() => {});
    await pool.query(`delete from companies where id = $1`, [t.company]).catch(() => {});
  }
}

async function main() {
  console.log("== RLS verification ==\n");

  // -- Preflight: is the migration actually applied? --------------------------
  const { rows: rls } = await pool.query(`
    select relname, relrowsecurity, relforcerowsecurity
    from pg_class where relname in ('documents', 'document_chunks')`);
  const { rows: policies } = await pool.query(`
    select tablename, policyname from pg_policies
    where tablename in ('documents', 'document_chunks')`);

  console.log("Preflight:");
  for (const name of ["documents", "document_chunks"]) {
    const row = rls.find((r) => r.relname === name);
    const pol = policies.find((p) => p.tablename === name);
    check(`${name}: RLS enabled`, row?.relrowsecurity === true);
    check(`${name}: RLS FORCED (owner not exempt)`, row?.relforcerowsecurity === true);
    check(`${name}: tenant policy exists`, Boolean(pol), "run drizzle-kit migrate on this branch first");
  }
  if (failed > 0) {
    console.log("\nMigration 0004 is not (fully) applied to this database. Aborting before seeding.");
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
