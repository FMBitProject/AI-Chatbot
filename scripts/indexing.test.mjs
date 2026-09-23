import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { sql } from "drizzle-orm";
import { db, pg } from "./security-test-db.mjs";
import { companies, documents } from "../src/lib/db/schema.ts";
import { chunkParentDocument } from "../src/lib/chunker.ts";
import { documentCatalog, catalogPrompt } from "../src/lib/document-catalog.ts";

// Apply the real additive migration over populated pre-migration tables.
// PGlite here has no pgvector: vector storage is text; query/perf is separate.
await pg.exec(`DROP TABLE document_index_chunks, indexing_provider_slots;
 ALTER TABLE companies DROP COLUMN indexing_checked_at;
 CREATE TABLE document_chunks (id text PRIMARY KEY, document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 company_id text NOT NULL, text text NOT NULL, embedding text, chunk_index integer NOT NULL,
 parent_text text, parent_index integer, UNIQUE(document_id, chunk_index));`);
await pg.exec("insert into companies(id,name) values ('a','A'), ('b','B')");
await db.insert(documents).values({id:"large",name:"Large",companyId:"a",status:"queued",rawText:"x".repeat(130_000)});
await pg.exec(readFileSync(new URL("../drizzle/0024_resumable_indexing.sql", import.meta.url), "utf8").replaceAll("vector(1536)", "text"));
await pg.query("insert into document_chunks values ('old','large','a','OLD','[1]',0,null,null)");

const state = globalThis.indexingTest = { calls: [], before: null };
const mocks = {
 "@/lib/embeddings": `export class EmbeddingBudgetExceededError extends Error {}
 export const isRateLimitError = e => e.statusCode === 429;
 export async function getEmbeddings(texts) {
   globalThis.indexingTest.calls.push(texts);
   if (globalThis.indexingTest.before) await globalThis.indexingTest.before();
   return texts.map(() => Array(1536).fill(0.01));
 }`,
 "@/lib/byok": `export const geminiKey = async () => null; export const resolveByok = async () => ({ok:true});`,
 "@/lib/models": `export const BATCH_CHAIN = [{}]; export const generateWithFallback = async () => ({text:'summary'});`,
};
registerHooks({resolve(spec,ctx,next) {
 if (mocks[spec]) return {url:`data:text/javascript,${encodeURIComponent(mocks[spec])}`,shortCircuit:true};
 return next(spec,ctx);
}});
const { runIndexingPass, requeueDocument } = await import("../src/lib/indexing.ts");
const { withEmbeddingSlot, ProviderBusyError } = await import("../src/lib/indexing-provider.ts");
const { runIndexingSweep } = await import("../src/lib/indexing-worker.ts");
const [company] = await db.select().from(companies).where(sql`id = 'a'`);
const clearSlots = () => pg.exec("delete from indexing_provider_slots");
const checkpointCount = async () => Number((await pg.query("select count(*) as n from document_index_chunks where document_id='large'")).rows[0].n);

const first = await runIndexingPass(company);
assert.equal(first.indexed,0);
assert.equal(first.stop,"rate-limited");
assert.equal(await checkpointCount(),100);
assert.equal((await pg.query("select text from document_chunks where document_id='large'")).rows[0].text,"OLD");
await clearSlots();
const second = await runIndexingPass(company);
assert.equal(second.indexed,1);
const expected = chunkParentDocument("x".repeat(130_000));
assert.equal(state.calls.flat().length,expected.length,"retry only embeds missing children");
assert.equal(await checkpointCount(),0);
assert.equal(Number((await pg.query("select count(*) n from document_chunks where document_id='large'")).rows[0].n),expected.length);
console.log("PASS checkpoint resume, no duplicated paid batches, old index remains visible until atomic publication");

// A changed source must not reuse old checkpoints.
await pg.query("update documents set status='queued' where id='large'");
await clearSlots(); await runIndexingPass(company);
assert.equal(await checkpointCount(),100);
await pg.query("update documents set raw_text=$1,status='queued' where id='large'",["changed ".repeat(30)]);
await clearSlots();
assert.equal((await runIndexingPass(company)).indexed,1);
assert.equal(await checkpointCount(),0);
assert.ok((await pg.query("select text from document_chunks where document_id='large'")).rows[0].text.startsWith("changed"));
console.log("PASS changed text invalidates checkpoint");

// Publication failure must roll back deletion and preserve the checkpoint for
// a manual retry without another provider call.
const oldIds=(await pg.query("select id from document_chunks where document_id='large'")).rows.map(r=>r.id);
await pg.exec(`CREATE FUNCTION reject_publish() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'simulated publish failure'; END $$;
 CREATE TRIGGER reject_publish BEFORE INSERT ON document_chunks FOR EACH ROW EXECUTE FUNCTION reject_publish();
 UPDATE documents SET status='queued' WHERE id='large';`);
await clearSlots();
assert.equal((await runIndexingPass(company)).failed,1);
assert.deepEqual((await pg.query("select id from document_chunks where document_id='large'")).rows.map(r=>r.id),oldIds);
assert.equal(await checkpointCount(),1);
const callsBefore=state.calls.length;
await pg.exec("DROP TRIGGER reject_publish ON document_chunks");
assert.equal(await requeueDocument('a','large'),true);
assert.equal((await runIndexingPass(company)).indexed,1);
assert.equal(state.calls.length,callsBefore,"publication retry reuses saved vectors");
console.log("PASS publication rollback and retry without paid provider work");

// A worker whose claim is replaced while awaiting the provider cannot write.
await pg.query("update documents set status='queued' where id='large'");
await clearSlots();
state.before = () => pg.exec("update documents set indexing_started_at=now()+interval '1 second' where id='large'");
const stolen = await runIndexingPass(company);
assert.equal(stolen.indexed,0);
assert.equal(await checkpointCount(),0);
state.before = null;
await pg.exec("update documents set status='success' where id='large'");
console.log("PASS superseded worker cannot checkpoint or publish");

// Distributed mutual exclusion and persisted cooldown, independent of tenant.
await clearSlots();
await withEmbeddingSlot("same-provider-key", async () => {
 await assert.rejects(withEmbeddingSlot("same-provider-key",async()=>1),ProviderBusyError);
 assert.equal(await withEmbeddingSlot("different-key",async()=>2),2);
});
await assert.rejects(withEmbeddingSlot("same-provider-key",async()=>1),ProviderBusyError);
assert.ok(!(await pg.query("select key_hash from indexing_provider_slots")).rows.some(r=>r.key_hash.includes("provider-key")));
console.log("PASS shared-key exclusion, independent keys and persistent cooldown");

// Tenant RLS including writes and ON DELETE CASCADE cleanup.
await pg.exec(`CREATE ROLE checkpoint_reader;
 GRANT SELECT, INSERT ON document_index_chunks TO checkpoint_reader;
 INSERT INTO document_index_chunks VALUES ('large','a','test',0,'text','parent',0,'[1]');`);
await db.transaction(async tx => {
 await tx.execute(sql`set local role checkpoint_reader`);
 await tx.execute(sql`select set_config('app.company_id','b',true)`);
 assert.equal((await tx.execute(sql`select * from document_index_chunks`)).rows.length,0);
});
await assert.rejects(db.transaction(async tx => {
 await tx.execute(sql`set local role checkpoint_reader`);
 await tx.execute(sql`select set_config('app.company_id','b',true)`);
 await tx.execute(sql`insert into document_index_chunks values ('large','a','test',1,'text','parent',0,'[1]')`);
}));
await pg.query("delete from documents where id='large'");
assert.equal(await checkpointCount(),0);
console.log("PASS migration, checkpoint tenant isolation and deletion cleanup");

// Bound DB payload AND prompt, preserve count including duplicate names and
// respect tenant, department, expiry, folder, and plan filters.
await db.insert(documents).values(Array.from({length:100},(_,i)=>({id:`catalog-${i}`,companyId:"a",name:"Same "+"x".repeat(1000),status:"success"})));
await db.insert(documents).values([
 {id:"secret",companyId:"b",name:"SECRET"},
 {id:"department",companyId:"a",name:"FINANCE",department:"Finance"},
 {id:"expired",companyId:"a",name:"EXPIRED",expiresAt:new Date(0)},
]);
async function catalog(opts={}) {
 return db.transaction(tx=>documentCatalog({companyId:"a",access:{role:"employee",department:"HR"},folder:null,maxDocuments:-1,...opts},tx));
}
const sample = await catalog();
assert.equal(sample.total,100);
assert.equal(sample.names.length,20);
assert.ok(sample.names.every(n=>n.length<=160));
assert.ok(catalogPrompt(sample).length<5000);
assert.equal((await catalog({folder:"Finance"})).total,0);
assert.equal((await catalog({maxDocuments:1})).total,1);
assert.equal((await catalog({maxDocuments:0})).total,0);
assert.ok(!catalogPrompt(sample).includes("SECRET"));
console.log("PASS bounded catalog, accurate count and access filters");

// A short sweep starting with an already scanned tenant must visit the other.
await pg.exec("update companies set indexing_checked_at=now() where id='a'");
let visits=0;
await runIndexingSweep({shouldStop:()=>visits++>=1});
assert.ok((await pg.query("select indexing_checked_at from companies where id='b'")).rows[0].indexing_checked_at);
console.log("PASS durable fair scheduling without a browser");
await pg.close();
