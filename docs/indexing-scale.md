a# Resumable indexing and scale checks

Upload stores raw text, then the indexer writes batches of at most 100 child
embeddings to `document_index_chunks`. This staging table has forced tenant RLS
and is never searched. A fingerprint of raw text plus the chunker/model version
prevents stale reuse. Change `INDEX_VERSION` in `indexing.ts` whenever chunking
or embedding settings change. Do not change the embedding model without a full
re-indexing plan.

Every batch is fenced by the document claim. Once all batches are present, one
transaction replaces searchable chunks via INSERT SELECT and deletes staging.
A retry repeats only an uncommitted batch; a re-index preserves the previous
searchable version until publication. Deleting a document cascades to staging.
Only one batch of embeddings is held in application memory, although extracted
text and the chunk list still reside in memory. Publication still updates HNSW
inside one transaction; measure that cost for exceptionally large documents.

## Rollout order

1. Apply `0024_resumable_indexing.sql` through the normal migration process
   **before** deploying this code. It only adds tables, indexes and a nullable
   column; old code keeps working. The migration has not been applied by this
   change. `npm run db:migrate` targets production through `.env.local`.
2. Deploy the application and worker from the same revision. Avoid overlapping
   old and new workers during rollout; old workers cannot use checkpoints.
3. Start the standalone worker under a supervisor. `scripts/deploy/intellibase-indexing.service`
   is a systemd template: adapt its user, working directory and npm path to the
   host. Install dependencies with Node 22.16+ (`npm ci`), and configure the
   environment file outside the checkout. Restart the worker on each deployment.

Run `npm run indexing:worker` for continuous processing, or append `-- --once`
for one bounded sweep. The command intentionally does not load `.env.local`.
Supply `DATABASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, provider keys used for
summaries, and `BYOK_SECRET_KEY` through the service environment. It needs the
same DB role and encryption key as the app. A worker cannot run persistently
inside a Vercel request; run this service on an always-on host/container. Until
it is started, the browser and existing daily cron remain the queue drivers.

The worker checks again after five seconds and rotates through companies by
persisted `indexing_checked_at`, taking at most 100 per sweep. Cron uses the same
rotation. The service allows up to 90 seconds per company (120 per sweep);
cron uses 15 seconds per company (45 per sweep). Provider calls inherit the
remaining budget; DB commits can finish beyond it. SIGTERM finishes the current company pass then exits. A crashed worker
leaves leases that expire; stuck documents become eligible again after ten
minutes. Per-key slots coordinate **all** ingestion callers (browser, worker,
cron) with a hash of the effective Gemini key: one active batch per key, one
second between successful batches, and 35 seconds after errors. Different keys
can run independently. Interactive query embeddings do not acquire this slot;
provider quota is still shared with them. A 429 keeps the checkpoints for retry.

## Verification

`npm run test:indexing` exercises real PostgreSQL transactions in ephemeral
PGlite with mocked provider responses and text in place of the vector storage
type. It checks checkpoint resume, claim fencing, migration/RLS, publication,
key coordination, fair scheduling, and bounded catalogs. It does not measure
pgvector performance or contact Neon/provider APIs.

`npm run rag:benchmark -- --help` describes the separate pgvector benchmark.
Set `BENCH_DATABASE_URL` to a **dedicated scratch Neon database with pgvector
0.8+ installed**, then run:

```sh
npm run rag:benchmark -- 10000 4
npm run rag:benchmark -- 100000 4
npm run rag:benchmark -- 1000000 8
```

The harness never falls back to `DATABASE_URL` or loads `.env.local`, and rejects
the same host/database when both URLs are supplied. It creates a uniquely named
schema and removes only that schema in `finally`; a forcibly killed process may
leave its `rag_bench_*` schema to clean up. Large runs require substantial DB
storage/compute: one million 1536-dimensional vectors alone are roughly 6 GB,
before text, HNSW, WAL, or temporary build space.

It reports synthetic insert time, HNSW build time, retrieval p50/p95 and recall
against exact retrieval, using the real tenant-scoped retrieval function. Runs
include folder filters, concurrent readers, and concurrent writes to other
tenants (so the exact baseline remains stable). Results include DB round trips.
It uses a shared benchmark pool, so it does not include the application's
per-request pool creation overhead. It excludes paid embedding/LLM latency and
is not an end-to-end chat benchmark or proof of semantic answer quality. Capture
worker `indexing_sweep` duration/count logs and production provider timings to
measure those separately. Repeat with representative documents/questions before
setting a latency SLA or changing HNSW/partitioning.

The chat catalog now counts accessible documents and includes at most 20 titles
of 160 characters each. Duplicate names still count as separate documents.
The prompt clearly labels the sample as incomplete and directs complete-list
requests to the document browser; content answers still require retrieved text.
