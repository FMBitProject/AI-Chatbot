import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { geminiKey, resolveByok } from "@/lib/byok";
import { BATCH_CHAIN, generateWithFallback } from "@/lib/models";
import { createHash } from "node:crypto";
import { ProviderBusyError, withEmbeddingSlot } from "@/lib/indexing-provider";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { companies, documents, documentChunks, documentIndexChunks } from "@/lib/db/schema";
import { chunkParentDocument } from "@/lib/chunker";
import { getEmbeddings, EmbeddingBudgetExceededError, isRateLimitError } from "@/lib/embeddings";
import type { Company } from "@/lib/subscription";

// Upload stores extracted text. The standalone worker, browser and daily cron
// share this queue; committed batches survive retries without re-embedding.

// A document claimed for indexing but left in "processing" for longer than this
// belongs to an invocation that died — a timeout, a deploy, a crash. Measured
// from `indexing_started_at`, the moment of the claim, and well past any single
// document's real processing time, so a genuinely running index in a parallel
// invocation can never be swept out from under itself.
//
// It used to be measured from `created_at`, which is when the file was
// *uploaded*. A document that sat in the queue overnight was therefore "stuck"
// the instant it was claimed, and a second worker — the cron and a browser pass
// overlap easily — would hand it back to the queue while the first was still
// embedding it. Both then paid for the same embeddings, and there was a window
// where the document had no chunks at all and simply did not answer searches.
const STUCK_AFTER_MS = 10 * 60 * 1000;

// Checked between batches and passed to embedding/summary HTTP deadlines.
// Database commits may finish after this work budget.
export const INDEX_RUN_BUDGET_MS = 120 * 1000;

// How long one pass's exclusive claim on a company's queue stays valid without
// being renewed, and therefore how long a *dead* pass blocks the next one.
//
// Correctness never depended on there being one pass: documents are claimed
// atomically, so any number of workers can share a queue without indexing
// anything twice. Throughput did. Every pass for a company embeds through the
// same Gemini key, so a second pass does not halve the time — it doubles the
// request rate against one rate limit, collects a 429 that much sooner, and
// hands its document back to the queue. Three admins retrying a stuck import is
// the exact input that makes the import slowest.
//
// Renewed before each document, so a live pass keeps it for as long as it is
// working and a killed one lets go on its own. Long enough to cover a single
// slow document (embedding retry budget plus a summary, ~4 minutes worst case)
// so that a pass working normally never loses the lease it still holds.
const INDEXING_LEASE_MS = 5 * 60 * 1000;

// How long the optional summary may take IN TOTAL before it is abandoned. See
// the call site: the summary is the only part of indexing a document can do
// without.
//
// Total, not per attempt, and that distinction is load-bearing now that the
// summary runs down a chain. The pass budget above is built on this number: at
// 30s per attempt a two-link chain would put the worst case at 120 + 120 + 60 =
// 300, which is exactly maxDuration and leaves nothing for the response. The
// call site divides this across the chain so the arithmetic that comment relies
// on stays true however many links BATCH_CHAIN grows to.
const SUMMARY_TIMEOUT_MS = 30 * 1000;

// Why a pass stopped, so the caller knows whether to come straight back.
//
// "busy" means another pass already holds this company's lease; the caller
// should not retry in a loop, because the work is already being done.
export type PassStop = "drained" | "budget" | "rate-limited" | "busy";

export interface IndexPassResult {
  indexed: number;
  failed: number;
  remaining: number;
  stop: PassStop;
}

// Errors an admin can act on: the message is stored on the row and shown in the
// document list. Anything else is logged and reported generically.
class IndexError extends Error {}

// A rate limit is not a broken document. Telling the two apart is the whole
// point of this class: a 429 means "come back later" and the document goes back
// to "queued" with its text intact, while a rejected key or an unparseable file
// means "this will never work" and the document is failed with a reason.
class RetryableError extends Error {}
class PassBudgetError extends Error {}

// Raised when the document we are holding is no longer ours to write to: the
// stuck sweep decided we were dead and a second pass re-claimed it, or the admin
// deleted it while we worked. Not a failure of the document, and emphatically
// not something to record on the row — it either belongs to another worker now
// or does not exist, and writing to it is precisely what must not happen.
//
// It is also what keeps the delete case clean. The row lock taken by the fenced
// UPDATE is held until this transaction ends, so a DELETE arriving mid-write
// waits for us rather than pulling the row out from under the chunk insert and
// turning it into a foreign key violation.
class ClaimLostError extends Error {}

interface ClaimedDocument {
  id: string;
  name: string;
  rawText: string;
  // The exact `indexing_started_at` this claim wrote, as Postgres renders it.
  //
  // Carried as text rather than as a Date on purpose: it travels out of the
  // database and back into a WHERE clause, and a timestamp that round-trips
  // through JavaScript loses microseconds, so every comparison would fail and
  // every document would look stolen. The text of the value compares to itself
  // exactly.
  lease: string;
}

// The condition every write to a claimed document carries: touch the row only
// if it is still the one this pass claimed.
//
// It is not only the chunk write that needs this. Marking a document "failed",
// or handing it back to the queue after a rate limit, is just as wrong when the
// row has been re-claimed in the meantime — an admin would watch a document that
// another pass is actively indexing flip to "gagal", and the next sweep would
// undo work that was never broken.
function stillOurs(doc: ClaimedDocument) {
  return and(
    eq(documents.id, doc.id),
    sql`${documents.indexingStartedAt}::text = ${doc.lease}`,
  );
}

// Takes this company's queue for one pass, or reports that someone else has it.
//
// The condition and the write are one statement, so two passes starting in the
// same instant cannot both win: Postgres serialises the UPDATE on the row, and
// the loser re-evaluates the WHERE afterwards against the winner's committed
// deadline and matches nothing.
//
// Returns the deadline it wrote, which doubles as proof of ownership — renewal
// and release both require it, so a pass that was superseded after its lease
// expired can neither extend nor clear the lease that now belongs to another.
async function acquireIndexingLease(companyId: string): Promise<Date | null> {
  const until = new Date(Date.now() + INDEXING_LEASE_MS);
  const rows = await db.update(companies)
    .set({ indexingLeaseUntil: until })
    .where(and(
      eq(companies.id, companyId),
      or(isNull(companies.indexingLeaseUntil), lt(companies.indexingLeaseUntil, new Date())),
    ))
    .returning({ id: companies.id });
  return rows.length > 0 ? until : null;
}

// Pushes the deadline back, as long as we are still the holder. A pass that has
// been superseded gets null and stops rather than working on documents another
// pass is already claiming.
async function renewIndexingLease(companyId: string, held: Date): Promise<Date | null> {
  const until = new Date(Date.now() + INDEXING_LEASE_MS);
  const rows = await db.update(companies)
    .set({ indexingLeaseUntil: until })
    .where(and(eq(companies.id, companyId), eq(companies.indexingLeaseUntil, held)))
    .returning({ id: companies.id });
  return rows.length > 0 ? until : null;
}

// Hands the queue back immediately instead of leaving the next pass to wait out
// the deadline. Guarded by the same proof of ownership, so a late finisher
// cannot clear a lease that has already moved on.
async function releaseIndexingLease(companyId: string, held: Date): Promise<void> {
  await db.update(companies)
    .set({ indexingLeaseUntil: null })
    .where(and(eq(companies.id, companyId), eq(companies.indexingLeaseUntil, held)));
}

// Returns documents stuck mid-index to the queue. Their text is still stored, so
// there is nothing to recover from the admin — just work to redo.
async function sweepStuckDocuments(companyId: string): Promise<void> {
  await withTenant(companyId, (tx) =>
    tx.update(documents)
      .set({ status: "queued" })
      .where(and(
        eq(documents.companyId, companyId),
        eq(documents.status, "processing"),
        // `indexing_started_at` is written by the claim, so this is genuinely
        // "claimed a long time ago and never finished". A NULL here means a row
        // claimed by the pre-0011 code; fall back to created_at for those rather
        // than leaving them stranded forever.
        sql`coalesce(${documents.indexingStartedAt}, ${documents.createdAt}) < now() - ${sql.raw(`interval '${STUCK_AFTER_MS} milliseconds'`)}`,
        sql`${documents.rawText} is not null`,
      )));

  // A "processing" row with no text is from the old pipeline, where the row was
  // written before the file was parsed. Nothing can index it, so say so instead
  // of cycling it through the queue forever.
  await withTenant(companyId, (tx) =>
    tx.update(documents)
      .set({
        status: "failed",
        errorMessage: "Pemrosesan terhenti sebelum teks dokumen sempat tersimpan. Silakan upload ulang dokumen ini.",
      })
      .where(and(
        eq(documents.companyId, companyId),
        eq(documents.status, "processing"),
        sql`coalesce(${documents.indexingStartedAt}, ${documents.createdAt}) < now() - ${sql.raw(`interval '${STUCK_AFTER_MS} milliseconds'`)}`,
        sql`${documents.rawText} is null`,
      )));
}

// Takes the oldest queued document and marks it "processing" in one statement.
//
// The claim commits on its own, before any embedding happens, which is what
// makes concurrent workers safe: the browser-driven pass and the nightly cron
// can run at the same moment and will never index the same document twice.
// `FOR UPDATE SKIP LOCKED` is what guarantees it — a second worker reaching the
// same row while the first holds it steps over it instead of blocking.
//
// It also means a worker that dies leaves the row in "processing" rather than
// "queued". That is deliberate: an interrupted document must not be picked up
// instantly by the next pass and fail the same way. sweepStuckDocuments returns
// it after STUCK_AFTER_MS.
//
// The ordering is least-recently-attempted first, not oldest first. Oldest first
// sounds fairer and is not: a document that fails every time — too large to
// embed inside the function's lifetime, say — stays the oldest queued row, so
// every pass claims it first, spends its budget on it, and hands it back. The
// other 499 documents of an import would never be reached. Ordering by when we
// last *tried* rotates each failure to the back, so the queue always makes
// progress. (Same reasoning, same shape, as transactions.last_checked_at in
// /api/cron/reconcile-payments.)
//
// NULLS FIRST is spelled out because Postgres sorts NULLs last for ASC, which
// would put never-attempted documents — the ones most likely to succeed — at the
// very back of the queue.
async function claimNextDocument(companyId: string): Promise<ClaimedDocument | null> {
  const rows = await withTenant(companyId, async (tx) => {
    const result = await tx.execute(sql`
      update ${documents} set status = 'processing', indexing_started_at = now()
      where id = (
        select id from ${documents}
        where company_id = ${companyId}
          and status = 'queued'
          and raw_text is not null
        order by indexing_started_at asc nulls first, created_at asc, id asc
        limit 1
        for update skip locked
      )
      returning id, name, raw_text, indexing_started_at::text as lease
    `);
    return result.rows as { id: string; name: string; raw_text: string; lease: string }[];
  });

  const row = rows[0];
  return row ? { id: row.id, name: row.name, rawText: row.raw_text, lease: row.lease } : null;
}

// Both numbers a pass needs before it decides to do anything, in one round trip.
//
// Worth its own query because of the cron: it walks every company in turn, and
// on all but the busiest days every one of them has an empty queue. One count
// beats opening a connection to sweep, another to claim, and a third to discover
// there was nothing to do.
async function queueStats(companyId: string): Promise<{ queued: number; stuck: number }> {
  const rows = await withTenant(companyId, async (tx) => {
    const result = await tx.execute(sql`
      select
        count(*) filter (where status = 'queued')::int as queued,
        count(*) filter (
          where status = 'processing'
            and coalesce(indexing_started_at, created_at) < now() - ${sql.raw(`interval '${STUCK_AFTER_MS} milliseconds'`)}
        )::int as stuck
      from ${documents}
      where company_id = ${companyId}
    `);
    return result.rows as { queued: number; stuck: number }[];
  });
  return rows[0] ?? { queued: 0, stuck: 0 };
}

// Everything between "we have the text" and "the vectors are stored".
//
// Deliberately does no database work while it waits on Gemini or Groq: a
// transaction held open across a 60-second embedding call ties up a Postgres
// connection for the whole wait, and Neon will eventually close it underneath
// us. Claim, then work, then write — three short touches rather than one long
// one.
// Bump this when chunking or embedding configuration changes.
const INDEX_VERSION = "parent-v1:gemini-embedding-001:1536:retrieval-document";
const BATCH_SIZE = 100;

async function embedAndStore(companyId: string, doc: ClaimedDocument, company: Company, deadline: number): Promise<void> {
  const chunks = chunkParentDocument(doc.rawText);
  if (!chunks.length) throw new IndexError("Isi dokumen ini terlalu pendek untuk diindeks.");
  const fingerprint = createHash("sha256").update(INDEX_VERSION).update("\0").update(doc.rawText).digest("hex");
  const checkpointWhere = and(eq(documentIndexChunks.documentId, doc.id), eq(documentIndexChunks.fingerprint, fingerprint));
  const saved = await withTenant(companyId, tx => tx
    .select({ index: documentIndexChunks.chunkIndex }).from(documentIndexChunks).where(checkpointWhere));
  const completed = new Set(saved.map(row => row.index));
  let ownGeminiKey: string | null;
  try {
    ownGeminiKey = await geminiKey(company);
  } catch {
    throw new IndexError("API key perusahaan tidak dapat dibuka. Periksa konfigurasi BYOK.");
  }
  for (let offset = 0; offset < chunks.length; offset += BATCH_SIZE) {
    const indices = Array.from({ length: Math.min(BATCH_SIZE, chunks.length - offset) }, (_, i) => offset + i)
      .filter(i => !completed.has(i));
    if (!indices.length) continue;
    if (Date.now() >= deadline) throw new PassBudgetError();
    let embeddings: number[][];
    try {
      embeddings = await withEmbeddingSlot(ownGeminiKey, () => getEmbeddings(
        indices.map(i => chunks[i].text), ownGeminiKey, { budgetMs: deadline - Date.now() },
      ));
    } catch (error) {
      if (error instanceof ProviderBusyError || isRateLimitError(error)) throw new RetryableError("Embedding sedang penuh.");
      if (error instanceof EmbeddingBudgetExceededError) throw new PassBudgetError();
      throw error;
    }
    if (embeddings.length !== indices.length || embeddings.some(v => v.length !== 1536 || v.some(n => !Number.isFinite(n)))) {
      throw new IndexError("Hasil embedding tidak lengkap atau tidak valid. Silakan indeks ulang.");
    }
    // Fence every batch against a superseded claim. A crash repeats at most
    // the batch whose successful response has not yet committed.
    await withTenant(companyId, async tx => {
      const held = await tx.update(documents).set({ errorMessage: null }).where(stillOurs(doc)).returning({ id: documents.id });
      if (!held.length) throw new ClaimLostError("Document claim was superseded");
      await tx.delete(documentIndexChunks).where(and(eq(documentIndexChunks.documentId, doc.id), sql`${documentIndexChunks.fingerprint} <> ${fingerprint}`));
      await tx.insert(documentIndexChunks).values(indices.map((i, j) => ({
        documentId: doc.id, companyId, fingerprint, chunkIndex: i,
        text: chunks[i].text, parentText: chunks[i].parentText,
        parentIndex: chunks[i].parentIndex, embedding: embeddings[j],
      }))).onConflictDoNothing();
    });
  }
  if (Date.now() >= deadline) throw new PassBudgetError();
  let summary: string | null = null;
  try {
    const keys = await resolveByok(company);
    if (!keys.ok) throw new Error(keys.message);
    const result = await generateWithFallback({
      label: "indexing", keys, chain: BATCH_CHAIN,
      timeout: Math.max(1, Math.floor(Math.min(SUMMARY_TIMEOUT_MS, deadline - Date.now()) / BATCH_CHAIN.length)),
      prompt: `Buat ringkasan profesional dalam 3-5 poin singkat Bahasa Indonesia. Dokumen: "${doc.name}"\n\n${chunks.slice(0, 3).map(c => c.text).join("\n\n").slice(0, 2000)}`,
    });
    summary = result.text.trim();
  } catch {
    console.warn(`[indexing] Optional summary skipped for document=${doc.id}`);
  }
  // Publish inside Postgres, avoiding a full embedding array and a giant
  // parameterized INSERT in application memory. Rollback preserves old chunks.
  await withTenant(companyId, async tx => {
    const kept = await tx.update(documents).set({ status: "success", summary, errorMessage: null })
      .where(stillOurs(doc)).returning({ id: documents.id });
    if (!kept.length) throw new ClaimLostError("Document claim was superseded");
    const [ready] = await tx.select({ count: sql<number>`count(*)::int` }).from(documentIndexChunks)
      .where(and(checkpointWhere, sql`${documentIndexChunks.chunkIndex} >= 0 and ${documentIndexChunks.chunkIndex} < ${chunks.length}`));
    if (ready.count !== chunks.length) throw new Error("Incomplete indexing checkpoint");
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, doc.id));
    await tx.execute(sql`
      insert into ${documentChunks} (id, document_id, company_id, text, embedding, chunk_index, parent_text, parent_index)
      select gen_random_uuid()::text, document_id, company_id, text, embedding, chunk_index, parent_text, parent_index
      from ${documentIndexChunks}
      where document_id = ${doc.id} and fingerprint = ${fingerprint}
        and chunk_index >= 0 and chunk_index < ${chunks.length}
    `);
    await tx.delete(documentIndexChunks).where(eq(documentIndexChunks.documentId, doc.id));
  });
}

// Indexes queued documents for one company until the queue is empty, the time
// budget runs out, or the embedding provider asks us to slow down.
//
// Safe to run concurrently with itself (see claimNextDocument), which is what
// lets the admin's browser and the nightly cron both drive it without
// coordination.
export async function runIndexingPass(
  company: Company,
  opts: { budgetMs?: number } = {},
): Promise<IndexPassResult> {
  const budgetMs = Math.max(0, Math.min(INDEX_RUN_BUDGET_MS, opts.budgetMs ?? INDEX_RUN_BUDGET_MS));
  const startedAt = Date.now();
  const companyId = company.id;

  const stats = await queueStats(companyId);
  if (stats.queued === 0 && stats.stuck === 0) {
    return { indexed: 0, failed: 0, remaining: 0, stop: "drained" };
  }

  // Checked before the lease is taken, so the cron's walk over every company —
  // where almost every queue is empty — never touches the companies table at
  // all, and an idle tenant can never be reported as busy.
  let lease = await acquireIndexingLease(companyId);
  if (!lease) {
    return { indexed: 0, failed: 0, remaining: stats.queued, stop: "busy" };
  }

  try {
    if (stats.stuck > 0) await sweepStuckDocuments(companyId);

    let indexed = 0;
    let failed = 0;
    let stop: PassStop = "drained";

    while (Date.now() - startedAt < budgetMs) {
      // Renewed per document rather than per pass: the deadline has to outlive
      // the slowest single document, and the only honest way to say "still
      // working" is to say it while still working. Losing it here means the
      // lease expired and another pass took over — which can only happen if we
      // were stalled long past a document's worst case, so stopping is right.
      const renewed = await renewIndexingLease(companyId, lease);
      if (!renewed) {
        console.warn(`[indexing] Lost indexing lease for company=${companyId}, stopping pass`);
        stop = "busy";
        break;
      }
      lease = renewed;

      const doc = await claimNextDocument(companyId);
      if (!doc) break;

      try {
        await embedAndStore(companyId, doc, company, startedAt + budgetMs);
        indexed++;
      } catch (error) {
        if (error instanceof ClaimLostError) {
          // Someone else owns this document and is indexing it right now.
          // Nothing to record, nothing to requeue — touching the row is the one
          // thing that would actually cause harm. Move on to the next document.
          console.warn(`[indexing] ${error.message}`);
          continue;
        }

        if (error instanceof RetryableError || error instanceof PassBudgetError) {
          // Put it back and stop the pass. Marching on to the next document
          // would just collect the same 429 for every remaining one, and burn
          // the whole budget doing it.
          console.warn(`[indexing] Paused document=${doc.id}; saved batches will resume`);
          await withTenant(companyId, (tx) =>
            tx.update(documents).set({ status: "queued" }).where(stillOurs(doc)));
          stop = error instanceof PassBudgetError ? "budget" : "rate-limited";
          break;
        }

        console.error(`[indexing] Error indexing document=${doc.id}:`, error);
        const errorMessage = error instanceof IndexError
          ? error.message
          : "Dokumen gagal diindeks karena kesalahan tak terduga di server.";
        try {
          await withTenant(companyId, (tx) =>
            tx.update(documents).set({ status: "failed", errorMessage }).where(stillOurs(doc)));
          failed++;
        } catch (updateError) {
          // Leaves the row in "processing"; the sweep at the top of the next
          // pass returns it to the queue. Not derailing the rest of the batch
          // matters more than recording this one reason.
          console.error(`[indexing] Could not mark ${doc.name} as failed:`, updateError);
        }
      }
    }

    const remaining = (await queueStats(companyId)).queued;
    if (stop === "drained" && remaining > 0) stop = "budget";

    return { indexed, failed, remaining, stop };
  } finally {
    // Handed back even when the pass throws, so the next one does not have to
    // wait out a deadline nobody is using. A pass that is killed outright never
    // reaches this — which is the whole reason the lease carries an expiry
    // rather than a flag.
    await releaseIndexingLease(companyId, lease).catch((error) => {
      console.error(`[indexing] Could not release indexing lease for company=${companyId}:`, error);
    });
  }
}

// Puts a document back in the queue — used by the "index ulang" action on a
// failed row. Only documents whose text is still stored can be requeued; one
// that failed during parsing has nothing to index and needs the file again.
//
// Clearing `indexing_started_at` sends it to the front of the queue. Automatic
// requeues (a rate limit, the stuck sweep) deliberately keep theirs so failures
// rotate to the back — but this one is a person clicking a button and waiting
// for something to happen, and there is no fairness question when the request is
// explicit.
export async function requeueDocument(companyId: string, documentId: string): Promise<boolean> {
  const updated = await withTenant(companyId, (tx) =>
    tx.update(documents)
      .set({ status: "queued", errorMessage: null, indexingStartedAt: null })
      .where(and(
        eq(documents.id, documentId),
        eq(documents.companyId, companyId),
        eq(documents.status, "failed"),
        sql`${documents.rawText} is not null`,
      ))
      .returning({ id: documents.id }));
  return updated.length > 0;
}
