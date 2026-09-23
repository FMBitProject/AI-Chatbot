// Synthetic PostgreSQL/pgvector benchmark; never uses DATABASE_URL as a fallback.
// Uses the real retrieval function, tenant GUC, filters, and parent expansion.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import { retrieveChunks } from "../src/lib/retrieval.ts";
import * as schema from "../src/lib/db/schema.ts";

if (process.argv.includes("--help")) {
  console.log("BENCH_DATABASE_URL=<dedicated Neon DB with pgvector> npm run rag:benchmark -- [10000|100000|1000000] [concurrency=4]");
  process.exit(0);
}
const url = process.env.BENCH_DATABASE_URL;
if (!url) throw new Error("Set BENCH_DATABASE_URL to a dedicated scratch database. No .env.local is loaded.");
const target = new URL(url);
if (process.env.DATABASE_URL) {
  const production = new URL(process.env.DATABASE_URL);
  if (target.hostname === production.hostname && target.pathname === production.pathname) throw new Error("Benchmark database must differ from DATABASE_URL");
}
const size = Number(process.argv[2] ?? 10000);
const concurrency = Number(process.argv[3] ?? 4);
if (![10000,100000,1000000].includes(size) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error("Sizes: 10000, 100000, 1000000. Concurrency: 1..32.");
}
neonConfig.webSocketConstructor = ws;
const pool = new Pool({connectionString:url, max:concurrency+2});
const db = drizzle(pool,{schema});
const namespace = `rag_bench_${randomUUID().replaceAll("-","")}`;
const ident = `"${namespace}"`;
const vector = (seed: number) => Array.from({length:1536},(_,i)=>Math.sin((seed+1)*(i+1)*0.001));
const percentile = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
try {
  await pool.query(`CREATE SCHEMA ${ident}`);
  await pool.query(`CREATE TABLE ${ident}.documents (
    id text PRIMARY KEY, company_id text NOT NULL, name text NOT NULL,
    department text, expires_at timestamp, created_at timestamp DEFAULT now());
    CREATE TABLE ${ident}.document_chunks (
    id text PRIMARY KEY, document_id text NOT NULL, company_id text NOT NULL,
    text text NOT NULL, embedding vector(1536), chunk_index integer,
    parent_text text, parent_index integer);
    CREATE INDEX ON ${ident}.documents(company_id,created_at,id);
    CREATE INDEX ON ${ident}.document_chunks(company_id);`);
  // 10 tenants, ten folders per tenant, 100 children per document.
  await pool.query(`INSERT INTO ${ident}.documents(id,company_id,name,department)
    SELECT i::text, (i%10)::text, 'Synthetic '||i, 'folder-'||(i/10%10)
    FROM generate_series(0,$1::int) i`,[Math.ceil((size+1000)/100)]);
  for (const table of ["documents","document_chunks"]) {
    await pool.query(`ALTER TABLE ${ident}.${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${ident}.${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON ${ident}.${table}
      USING (company_id=current_setting('app.company_id',true))
      WITH CHECK (company_id=current_setting('app.company_id',true));`);
  }
  async function insert(from: number, to: number, skipQueryTenant = false) {
    // Per-tenant transactions also exercise RLS on synthetic ingestion.
    for (let tenant=skipQueryTenant ? 1 : 0;tenant<10;tenant++) await db.transaction(async tx=>{
      await tx.execute(sql`select set_config('search_path', ${namespace + ', public'}, true), set_config('app.company_id', ${String(tenant)}, true)`);
      await tx.execute(sql`insert into document_chunks
        select i::text, (i/100)::text, (i/100%10)::text, 'Synthetic child '||i,
          (array(select sin((i+1)::float8*d*0.001)::real from generate_series(1,1536) d))::vector,
          i%100, 'Synthetic parent '||(i/4), i%100/4
        from generate_series(${from}::int,${to}::int) i where i/100%10=${tenant}`);
    });
  }
  const ingestStart=performance.now();
  for(let i=0;i<size;i+=1000) await insert(i,Math.min(size-1,i+999));
  const insertMs=performance.now()-ingestStart;
  const indexStart=performance.now();
  await pool.query(`CREATE INDEX ON ${ident}.document_chunks USING hnsw (embedding vector_cosine_ops);
    ANALYZE ${ident}.documents; ANALYZE ${ident}.document_chunks;`);
  const indexBuildMs=performance.now()-indexStart;
  async function query(seed: number, exact=false, folder: string|null=null) {
    return db.transaction(async tx=>{
      await tx.execute(sql`select set_config('search_path', ${namespace + ', public'}, true), set_config('app.company_id','0',true)`);
      if(exact) await tx.execute(sql`set local enable_indexscan=off`);
      return retrieveChunks({companyId:"0",access:{role:"admin"},queryEmbedding:vector(seed),
        maxDocuments:-1,folder,limit:30,minScore:-1,expandParents:true},tx);
    });
  }
  // Warm-up; exact retrieval provides a recall baseline for the same filters.
  await query(0);
  for (const folder of [null,"folder-0"]) {
    const seeds=Array.from({length:10},(_,i)=>i*7);
    const baseline=await Promise.all(seeds.map(seed=>query(seed,true,folder)));
    for (const concurrentWrites of [false,true]) {
      const latencies:number[]=[];
      const recalls:number[]=[];
      let next=0;
      const writer=concurrentWrites ? insert(size,size+999,true) : Promise.resolve();
      await Promise.all(Array.from({length:concurrency},async()=>{
        while(next<40) {
          const n=next++;
          const started=performance.now();
          const found=await query(seeds[n%10],false,folder);
          latencies.push(performance.now()-started);
          const expected=new Set(baseline[n%10].map(c=>`${c.documentId}:${c.text}`));
          recalls.push(expected.size ? found.filter(c=>expected.has(`${c.documentId}:${c.text}`)).length/expected.size : 1);
        }
      }));
      await writer;
      console.log(JSON.stringify({size,concurrency,folder,concurrentWrites,insertMs,indexBuildMs,
        retrievalP50Ms:percentile(latencies,.5),retrievalP95Ms:percentile(latencies,.95),
        meanRecall:recalls.reduce((a,b)=>a+b,0)/recalls.length}));
      if(concurrentWrites) {
        // Use tenant scope for cleanup, too.
        for(let tenant=0;tenant<10;tenant++) await db.transaction(async tx=>{
          await tx.execute(sql`select set_config('search_path', ${namespace + ', public'}, true),set_config('app.company_id', ${String(tenant)}, true)`);
          await tx.execute(sql`delete from document_chunks where id::integer >= ${size}`);
        });
      }
    }
  }
} finally {
  // Only the unique schema created by this invocation is removed.
  await pool.query(`DROP SCHEMA IF EXISTS ${ident} CASCADE`).finally(()=>pool.end());
}
