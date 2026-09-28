import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { pg, db, withTenant } from "./security-test-db.mjs";
import { authState } from "./byok-test-auth.mjs";
import { classificationInput, allowedProvidersInput, PrivacyBlockedError } from "../src/lib/privacy-policy.ts";
import { loadPrivacy, privacyFetch } from "../src/lib/privacy.ts";
import { queueDocument } from "../src/lib/document-ingest.ts";
import { requeueDocument } from "../src/lib/indexing.ts";
import { documentCatalog } from "../src/lib/document-catalog.ts";
import { DELETE, PATCH } from "../src/app/api/admin/documents/[id]/route.ts";
import { GET, PUT } from "../src/app/api/admin/privacy/route.ts";
import { usableChain, INTERACTIVE_CHAIN, generateWithFallback } from "../src/lib/models.ts";
import { getEmbeddings } from "../src/lib/embeddings.ts";
import { chatMessages } from "../src/lib/db/schema.ts";
import { eq, and } from "drizzle-orm";

// The retired maintenance entry point must stop before credentials or networking.
const retired = spawnSync(process.execPath, ['scripts/backfill-rag.mjs'], { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
assert.ifError(retired.error);
assert.equal(retired.status, 1);
assert.match(retired.stderr, /Backfill lama dinonaktifkan/);

// Upgrade a populated old database using the actual migration; never use Neon.
await pg.exec(`DROP TABLE privacy_events, company_privacy;
 ALTER TABLE documents DROP COLUMN classification;
 ALTER TABLE chat_messages DROP COLUMN privacy_revision;
 INSERT INTO companies(id,name) VALUES ('a','A'),('b','B');
 INSERT INTO users(id,name,email,company_id,role) VALUES ('u','User','u@test.invalid','a','admin');
 INSERT INTO documents(id,name,company_id,status,raw_text) VALUES ('old','SOP','a','success','private SOP text');
 INSERT INTO chat_sessions(id,user_id,company_id,title) VALUES ('s','u','a','History');
 INSERT INTO chat_messages(id,session_id,role,content) VALUES ('legacy','s','assistant','private SOP text');
 CREATE TABLE document_chunks (id text PRIMARY KEY, document_id text REFERENCES documents(id) ON DELETE CASCADE, company_id text, text text);
 INSERT INTO document_chunks VALUES ('chunk','old','a','private SOP text');
 INSERT INTO document_index_chunks(document_id,company_id,fingerprint,chunk_index,text,parent_text,parent_index,embedding)
 VALUES ('old','a','hash',0,'private SOP text','private SOP text',0,'[1]');`);
await pg.exec(readFileSync(new URL("../drizzle/0025_privacy_controls.sql", import.meta.url), "utf8"));
assert.equal((await pg.query("select classification from documents where id='old'")).rows[0].classification,"internal");
assert.equal((await pg.query("select privacy_revision from chat_messages where id='legacy'")).rows[0].privacy_revision,0);
assert.equal(classificationInput("invalid"),null);
assert.equal(classificationInput(undefined),"internal");
assert.deepEqual(allowedProvidersInput([]),[]);
assert.equal(allowedProvidersInput(["groq","groq"]),null);
assert.equal(allowedProvidersInput(["untrusted"]),null);

const request = (method, body) => new NextRequest("http://localhost/api/admin/privacy", {method, ...(body ? {headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {})});
const params = id => ({params:Promise.resolve({id})});
let calls = 0;
globalThis.fetch = async () => { calls++; return Response.json({ok:true}); };
const old = await loadPrivacy('a'); old.documentIds=['old'];
await privacyFetch(old,'groq')('https://provider.invalid', {method:'POST',body:'private SOP text'});
assert.equal(calls,1);
const events = (await pg.query("select * from privacy_events")).rows;
assert.equal(events[0].action,'provider_attempt');
assert.deepEqual(events[0].document_ids,['old']);
assert.ok(!JSON.stringify(events).includes('private SOP text'));

// Foreign tenant IDs and confidential documents never reach the transport.
await queueDocument({companyId:'b',maxDocuments:10,docId:'foreign',name:'Other',department:null,rawText:'other secret'});
await assert.rejects(privacyFetch({...old,documentIds:['foreign']},'groq')('https://provider.invalid'),PrivacyBlockedError);
await queueDocument({companyId:'a',maxDocuments:10,docId:'secret',name:'Secret',department:null,rawText:'highly confidential',classification:'confidential'});
assert.equal((await pg.query("select status from documents where id='secret'")).rows[0].status,'blocked');
assert.equal(await requeueDocument('a','secret'),false);
await assert.rejects(privacyFetch({...old,documentIds:['secret']},'google')('https://provider.invalid'),PrivacyBlockedError);
const catalog = await withTenant('a',tx=>documentCatalog({companyId:'a',access:{role:'admin'},folder:null,maxDocuments:-1},tx));
assert.deepEqual(catalog.names,['SOP']);
assert.equal(calls,1);

// Auth and compare-and-set prevent unauthorized/stale policy writes.
authState.status='employee';
assert.equal((await PUT(request('PUT',{allowedProviders:[],revision:0}))).status,403);
authState.status='admin';
assert.equal((await PUT(request('PUT',{allowedProviders:['google'],revision:0}))).status,200);
assert.equal((await PUT(request('PUT',{allowedProviders:['groq'],revision:0}))).status,409);
let current = await loadPrivacy('a');
assert.deepEqual(usableChain(INTERACTIVE_CHAIN,{groq:'g',gemini:'k',privacy:current}).map(x=>x.provider),['google']);
await assert.rejects(privacyFetch(old,'groq')('https://provider.invalid'),PrivacyBlockedError);
await assert.rejects(privacyFetch(current,'groq')('https://provider.invalid'),PrivacyBlockedError);
assert.equal(calls,1);

// Every batch gets a fresh policy check: changing policy after batch one stops
// batch two before its body is sent. SDK and transport are real, HTTP is fake.
globalThis.fetch = async (_url, init) => {
  calls++;
  const body=JSON.parse(init.body);
  await PUT(request('PUT',{allowedProviders:[],revision:current.revision}));
  return Response.json({embeddings:body.requests.map(()=>({values:Array(1536).fill(0)}))});
};
await assert.rejects(getEmbeddings(Array(101).fill('private SOP text'),'fake-key',{privacy:{...current,documentIds:['old']}}));
assert.equal(calls,2,'only first batch dispatched');

// Deletion must invalidate old in-memory contexts and cascade both indices.
assert.equal((await DELETE(request('DELETE'),params('foreign'))).status,404);
assert.equal((await DELETE(request('DELETE'),params('old'))).status,200);
for(const table of ['document_chunks','document_index_chunks']) assert.equal((await pg.query(`select count(*)::int n from ${table} where document_id='old'`)).rows[0].n,0);
await assert.rejects(privacyFetch(old,'groq')('https://provider.invalid'),PrivacyBlockedError);
assert.equal((await DELETE(request('DELETE'),params('old'))).status,404);
// A late answer from an already-sent request retains its old epoch. Neither it
// nor legacy answers pass the same epoch predicate used by the chat route.
await db.insert(chatMessages).values({id:'late',sessionId:'s',role:'assistant',content:'private SOP text',privacyRevision:old.revision});
current=await loadPrivacy('a');
assert.equal((await db.select().from(chatMessages).where(and(eq(chatMessages.sessionId,'s'),eq(chatMessages.privacyRevision,current.revision)))).length,0);
assert.equal((await pg.query('select count(*)::int n from chat_messages')).rows[0].n,2,'readable history retained');

await queueDocument({companyId:'a',maxDocuments:10,docId:'change',name:'Change',department:null,rawText:'content'});
assert.equal((await PATCH(request('PATCH',{classification:'confidential'}),params('change'))).status,200);
assert.equal((await pg.query("select status from documents where id='change'")).rows[0].status,'blocked');
assert.equal((await PATCH(request('PATCH',{classification:'invalid'}),params('change'))).status,400);
assert.equal((await PATCH(request('PATCH',{classification:'normal'}),params('foreign'))).status,404);

// A failure while recording deletion must roll back the deletion and revision.
await pg.exec(`CREATE FUNCTION reject_privacy_event() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$;
 CREATE TRIGGER reject_privacy_event BEFORE INSERT ON privacy_events FOR EACH ROW EXECUTE FUNCTION reject_privacy_event();`);
const beforeFailure=await loadPrivacy('a');
await assert.rejects(DELETE(request('DELETE'),params('change')));
assert.equal((await pg.query("select count(*)::int n from documents where id='change'")).rows[0].n,1);
assert.equal((await loadPrivacy('a')).revision,beforeFailure.revision);
const other=await loadPrivacy('b');
await assert.rejects(privacyFetch({...other,documentIds:['foreign']},'groq')('https://provider.invalid'));
assert.equal(calls,2,'audit failure must prevent external dispatch');
await pg.exec('DROP TRIGGER reject_privacy_event ON privacy_events');

// RLS exercised with a non-owner role, including missing tenant context.
await pg.exec(`CREATE ROLE privacy_reader; GRANT SELECT,INSERT,UPDATE,DELETE ON company_privacy,privacy_events TO privacy_reader; SET ROLE privacy_reader;`);
assert.equal((await pg.query('select * from privacy_events')).rows.length,0);
await pg.exec("select set_config('app.company_id','b',false)");
assert.equal((await pg.query('select * from privacy_events')).rows.length,0);
await assert.rejects(pg.exec("insert into company_privacy(company_id) values ('a')"));
await pg.exec("select set_config('app.company_id','a',false)");
assert.ok((await pg.query('select * from privacy_events')).rows.length>0);
await pg.exec('RESET ROLE');
assert.equal((await GET(request('GET'))).status,200);

// Denied fallback cannot be silently substituted with another provider.
current=await loadPrivacy('a');
await assert.rejects(generateWithFallback({keys:{groq:'g',gemini:'k',privacy:current},prompt:'private SOP text',label:'privacy-test'}));
assert.equal(calls,2);
await pg.close();
console.log('PASS privacy: additive migration, RLS, policy conflicts, confidential storage, real SDK batch revocation, fallback restrictions, deletion cascades and legacy/late history exclusion');
