// Real retrieval SQL and tenant RLS; deterministic vector distance replaces
// pgvector only. No provider traffic or production database connection.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { sql } from "drizzle-orm";
import { db, pg } from "./security-test-db.mjs";
import { companies, documents } from "../src/lib/db/schema.ts";
import { chunkParentDocument, CHILD_CHARS, PARENT_CHARS } from "../src/lib/chunker.ts";
import { retrieveChunks } from "../src/lib/retrieval.ts";

const sop = "# Prosedur\n\n" + Array.from({ length: 30 }, (_, i) =>
  `Langkah ${i}: petugas mencatat pemeriksaan dan mengikuti prosedur di unit pelayanan.`).join("\n\n")
  + "\n\nPengecualian: jangan lanjutkan bila identitas belum terkonfirmasi.";
const chunks = chunkParentDocument(sop);
assert.ok(chunks.length > 1);
assert.ok(chunks[0].text.includes("Langkah 0"));
assert.ok(!chunks[0].text.includes("Pengecualian"));
assert.ok(chunks[0].parentText.includes("Pengecualian"));
for (const c of chunks) {
  assert.ok(c.text.length <= CHILD_CHARS);
  assert.ok(c.parentText.length <= PARENT_CHARS);
  assert.ok(c.parentText.includes(c.text));
}
const sectioned = chunkParentDocument(sop + "\n\n## Bagian lain\n\nSyarat baru untuk prosedur kedua.");
assert.ok(sectioned.some(c => c.parentText.includes("Bagian lain")));
assert.ok(!sectioned.some(c => c.parentText.includes("Pengecualian") && c.parentText.includes("Bagian lain")));
const tail = chunkParentDocument("x".repeat(PARENT_CHARS) + "TAIL");
assert.ok(tail.some(c => c.text.includes("TAIL")), "short tail is not dropped");
assert.deepEqual(chunkParentDocument("short"), []);
assert.ok(chunkParentDocument(sop.replaceAll("\n", "\r\n")).every(c => !c.text.includes("\r")));
console.log("PASS bounded children/parents, heading separation, short tails and exception context");

await pg.exec(`
 CREATE TABLE document_chunks (id text PRIMARY KEY, document_id text NOT NULL REFERENCES documents(id),
 company_id text NOT NULL REFERENCES companies(id), text text NOT NULL, embedding text, chunk_index integer DEFAULT 0);
 CREATE FUNCTION test_distance(text, text) RETURNS double precision LANGUAGE SQL IMMUTABLE AS 'SELECT $1::double precision';
 CREATE OPERATOR <=> (LEFTARG = text, RIGHTARG = text, FUNCTION = test_distance);
 CREATE ROLE retrieval_reader;
 GRANT SELECT ON documents, document_chunks TO retrieval_reader;
`);
await pg.exec(readFileSync(new URL("../drizzle/0004_row_level_security.sql", import.meta.url), "utf8"));
await db.insert(companies).values([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
await db.insert(documents).values([
 { id: "allowed", companyId: "a", name: "SOP", status: "success", createdAt: new Date("2020-01-01") },
 { id: "other", companyId: "a", name: "Other", status: "success", department: "HR" },
 { id: "legacy", companyId: "a", name: "Legacy", status: "success" },
 { id: "private", companyId: "b", name: "Private", status: "success" },
 { id: "restricted", companyId: "a", name: "Finance", status: "success", department: "Finance" },
 { id: "expired", companyId: "a", name: "Expired", status: "success", expiresAt: new Date("2020-01-01") },
]);
await pg.query("insert into document_chunks(id, document_id, company_id, text, embedding) values ('legacy-child', 'legacy', 'a', 'Legacy excerpt', '0.25')");
// Apply the actual additive migration over a populated legacy table.
await pg.exec(readFileSync(new URL("../drizzle/0023_parent_child_chunks.sql", import.meta.url), "utf8"));
for (const row of [
 ["child-a", "allowed", "a", chunks[0].text, "0.10", chunks[0].parentText, 0],
 ["child-b", "allowed", "a", chunks[1].text, "0.11", chunks[1].parentText, 0],
 ["child-other", "other", "a", "HR child", "0.20", "HR parent", 0],
 ["child-private", "private", "b", "Secret", "0.01", "PRIVATE PARENT", 0],
 ["child-restricted", "restricted", "a", "Finance", "0.02", "FINANCE PARENT", 0],
 ["child-expired", "expired", "a", "Obsolete", "0.03", "EXPIRED PARENT", 0],
]) await pg.query("insert into document_chunks(id,document_id,company_id,text,embedding,parent_text,parent_index) values ($1,$2,$3,$4,$5,$6,$7)", row);

async function retrieve(options = {}) {
 return db.transaction(async tx => {
  await tx.execute(sql`set local role retrieval_reader`);
  await tx.execute(sql`select set_config('app.company_id', 'a', true)`);
  return retrieveChunks({ companyId: "a", queryEmbedding: [1, 0], access: { role: "employee", department: "HR" },
    expandParents: true, limit: 5, ...options }, tx);
 });
}
const parents = await retrieve();
assert.deepEqual(parents.map(c => c.id), ["child-a", "child-other", "legacy-child"]);
assert.ok(parents[0].text.includes("Pengecualian"));
assert.equal(parents[0].score, 0.9);
assert.equal(parents[2].text, "Legacy excerpt");
assert.deepEqual((await retrieve({ folder: "HR" })).map(c => c.id), ["child-other"]);
assert.deepEqual((await retrieve({ maxDocuments: 1 })).map(c => c.id), ["child-a"]);
assert.deepEqual(await retrieve({ maxDocuments: 0 }), []);
assert.deepEqual(await retrieve({ minScore: 0.95 }), []);
const children = await retrieve({ expandParents: false });
assert.equal(children[0].text, chunks[0].text);
assert.ok(children.some(c => c.id === "child-b"));
const budgeted = await retrieve({ maxContextChars: 30 });
assert.ok(budgeted.every(c => c.documentId !== "allowed"));
assert.ok(budgeted.reduce((n, c) => n + c.text.length, 0) <= 30);
assert.equal(budgeted[0].text, "HR parent");
console.log("PASS parent deduplication, child ranking/citation, legacy migration, tenant/department/folder/expiry/quota filters and whole-parent budget");

// Run the real indexer and replacement transaction. Mock only paid provider
// calls/key resolution; verify that embeddings receive CHILDREN, not parents.
const providerState = globalThis.parentIndexTest = { inputs: [], fail: false };
const providerMocks = {
 "@/lib/embeddings": `export class EmbeddingBudgetExceededError extends Error {}
   export const isRateLimitError = () => false;
   export async function getEmbeddings(texts) {
     globalThis.parentIndexTest.inputs = texts;
     if (globalThis.parentIndexTest.fail) throw new Error('simulated provider outage');
     return texts.map(() => [1, 0]);
   }`,
 "@/lib/byok": `export const geminiKey = async () => null;
   export const resolveByok = async () => ({ok: true});`,
 "@/lib/models": `export const BATCH_CHAIN = [{}];
   export const generateWithFallback = async () => ({text: 'Test summary'});`,
};
registerHooks({ resolve(spec, context, next) {
 if (providerMocks[spec]) return { url: `data:text/javascript,${encodeURIComponent(providerMocks[spec])}`, shortCircuit: true };
 return next(spec, context);
} });
const { runIndexingPass } = await import("../src/lib/indexing.ts");
await pg.query("update documents set status='queued', raw_text=$1 where id='allowed'", [sop]);
const [company] = await db.select().from(companies).where(sql`id = 'a'`);
const pass = await runIndexingPass(company);
assert.equal(pass.indexed, 1);
assert.deepEqual(providerState.inputs, chunks.map(c => c.text));
const stored = (await pg.query("select * from document_chunks where document_id='allowed' order by chunk_index")).rows;
assert.equal(stored.length, chunks.length);
for (const [i, row] of stored.entries()) {
 assert.equal(row.text, chunks[i].text);
 assert.equal(row.parent_text, chunks[i].parentText);
 assert.equal(row.parent_index, chunks[i].parentIndex);
}
providerState.fail = true;
await pg.query("update documents set status='queued' where id='allowed'");
const failedPass = await runIndexingPass(company);
assert.equal(failedPass.failed, 1);
assert.deepEqual((await pg.query("select id from document_chunks where document_id='allowed' order by chunk_index")).rows.map(r => r.id), stored.map(r => r.id));
console.log("PASS indexer embeds children, stores matching parent metadata, and retains old chunks on provider failure");
await pg.close();
