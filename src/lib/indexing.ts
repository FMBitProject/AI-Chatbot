import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { geminiKey, resolveByok } from "@/lib/byok";
import { BATCH_CHAIN, generateWithFallback } from "@/lib/models";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { companies, documents, documentChunks } from "@/lib/db/schema";
import { chunkText } from "@/lib/chunker";
import { getEmbeddings, EmbeddingBudgetExceededError, isRateLimitError } from "@/lib/embeddings";
import type { Company } from "@/lib/subscription";

// Turning an uploaded document into searchable vectors, separated from the
// request that received the file.
//
// Upload used to do both: receive the bytes *and* embed every chunk, inside one
// serverless invocation capped at 300 seconds. That coupling is what made a
// 500-document import unworkable. One slow or rate-limited document could run
// the request past the cap, and a killed function runs neither its success path
// nor its catch — so the row stayed "processing" forever, and the work already
// paid for (parsing the file) was lost with it. The admin's only recourse was to
// upload the same file again.
//
// Now upload only parses and stores the text (fast, deterministic, no third
// party involved), and indexing happens here — driven by the admin's browser
// while it is open, and by a daily cron for whatever is left. Because
// `documents.raw_text` is already in the database, indexing is *resumable*: a
// retry costs one embedding call, never another upload.

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

// How long one indexing pass may keep working before returning.
//
// The budget is only checked *between* documents, so the real worst case is this
// plus one whole document: up to ~120s inside getEmbeddings' retry budget plus a
// summary call. 120 + 120 + ~30 fits inside the route's maxDuration = 300 with
// room to spare; the previous 150 did not, and a pass cut off mid-document is
// exactly what leaves a row stranded in "processing". Whatever is left stays
// "queued" and the next pass picks it up — the queue is the progress record, so
// stopping early costs nothing.
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
async function embedAndStore(companyId: string, doc: ClaimedDocument, company: Company): Promise<void> {
  const chunks = chunkText(doc.rawText);

  // The text was checked for emptiness at upload, so an empty result here means
  // the file had *some* text but not enough for a single chunk.
  if (chunks.length === 0) {
    throw new IndexError(
      "Isi dokumen ini terlalu pendek untuk diindeks. Tambahkan isinya dulu, lalu upload lagi."
    );
  }

  // Decrypted once, before the try, so that a key we cannot unwrap is not filed
  // as an embedding failure. The two are different problems with different
  // fixes — one is the provider being busy, the other is BYOK_SECRET_KEY being
  // wrong — and the catch below exists to tell the admin which of those it was.
  //
  // Re-thrown as an IndexError so the reason reaches the admin: the outer handler
  // only surfaces IndexError messages, and files anything else as "kesalahan tak
  // terduga di server", which would send someone hunting through the document
  // instead of through the environment.
  let ownGeminiKey: string | null;
  try {
    ownGeminiKey = geminiKey(company);
  } catch (error) {
    throw new IndexError(error instanceof Error ? error.message : String(error));
  }

  let embeddings: number[][];
  try {
    embeddings = await getEmbeddings(chunks, ownGeminiKey);
  } catch (error) {
    console.error(`[indexing] Embedding failed for ${doc.name}:`, error);
    const ownKey = !!ownGeminiKey;
    // Any 429 counts as rate limiting, not just the budget error: when the
    // provider's retry-after is short, five attempts can be spent inside the
    // budget and the raw 429 propagates instead. Both mean "too fast", and
    // neither means "your key is wrong" — which is the one message that would
    // send an admin to revoke a perfectly good key.
    //
    // Via isRateLimitError rather than a substring test on the message. The
    // test used to be `message.includes("429")`, which Gemini's own 429 never
    // satisfies — the status lives on the error object, not in its prose — so
    // this branch was unreachable for the single most common failure on the
    // free tier, and every rate-limited document was filed as broken instead
    // of being handed back to the queue.
    const isRateLimit =
      error instanceof EmbeddingBudgetExceededError || isRateLimitError(error);
    if (isRateLimit) {
      // Back to the queue, untouched. The old pipeline failed the document here
      // and made the admin upload the file again for what was a temporary
      // "slow down" — during a bulk import, the one moment it is guaranteed to
      // happen.
      throw new RetryableError(
        ownKey
          ? "API key Gemini perusahaan Anda sedang kena rate limit."
          : "Layanan embedding sedang penuh."
      );
    }
    throw new IndexError(
      ownKey
        ? "Gagal membuat index AI — API key Gemini perusahaan Anda ditolak atau sudah tidak berlaku. " +
          "Periksa key tersebut di tab Langganan, atau hapus key-nya untuk kembali memakai layanan bawaan."
        : "Gagal membuat index AI untuk dokumen ini — layanan embedding sedang bermasalah " +
          "atau kuotanya habis. Coba lagi beberapa menit lagi."
    );
  }

  // The insert below pairs chunk i with embedding i. A short array would not
  // error — `embedding` is nullable, so the missing tail would be stored as NULL
  // and the document would be marked "success" while part of it stayed invisible
  // to every search. Fail loudly instead; a silent half-indexed document is
  // worse than a failed one the admin can retry.
  if (embeddings.length !== chunks.length) {
    console.error(
      `[indexing] Embedding count mismatch for ${doc.name}: got ${embeddings.length} for ${chunks.length} chunks`
    );
    throw new IndexError(
      "Index AI dokumen ini tidak lengkap terbentuk, jadi tidak disimpan supaya " +
      "isinya tidak sebagian-sebagian saat dicari. Coba indeks ulang dokumen ini."
    );
  }

  // Auto-generate the document summary. Uses the company's own Groq key when
  // there is one, like every other generation call: this prompt carries the
  // opening 2000 characters of the uploaded file, so it is document content
  // leaving the server, not metadata.
  //
  // Key resolution stays INSIDE the try, not above it. It decrypts, so unlike
  // the plain `company.groqApiKey ? createGroq(…) : groq` it replaced, it can
  // fail — and failing one line above the try would have lost the whole document
  // over an optional summary, after the embeddings had already been paid for.
  // That is reachable without any Gemini key being involved: a company that
  // configured only a Groq key gets `null` from geminiKey() above, embeds fine
  // on the platform account, and then dies here.
  const sampleText = chunks.slice(0, 3).join("\n\n").slice(0, 2000);
  let summary: string | null = null;
  try {
    const byok = resolveByok(company);
    if (!byok.ok) throw new Error(byok.message);
    const { text } = await generateWithFallback({
      label: "indexing",
      keys: { groq: byok.groq, gemini: byok.gemini },
      // BATCH_CHAIN, not the interactive one: this runs once per document and
      // hundreds of times during a bulk import. Letting it climb to the Gemini
      // rung would spend a shared daily free-tier allowance on summaries nobody
      // is waiting for, and the person who paid for it would be an employee
      // whose question hits a metered-out Groq that afternoon.
      chain: BATCH_CHAIN,
      // The one call in this function that is optional, so it is the one that
      // least deserves to hold a pass open. Without a deadline a silent Groq
      // would stall a document that is otherwise finished — its embeddings paid
      // for, its chunks ready to write — for the sake of a summary nobody would
      // miss. Failing here costs a bullet list; hanging here costs the document.
      //
      // Split across the chain, because the option is applied per attempt and
      // the pass budget is sized on the summary's total. Trading a shorter first
      // attempt for a bounded whole is the right way round here: the cost of
      // giving up early is a bullet list nobody asked for, while the cost of
      // overrunning is a document stranded mid-index in "processing".
      timeout: Math.floor(SUMMARY_TIMEOUT_MS / BATCH_CHAIN.length),
      prompt: `Buat ringkasan profesional dari dokumen berikut dalam 3-5 poin utama menggunakan Bahasa Indonesia. Format: bullet points singkat dan jelas. Dokumen: "${doc.name}"\n\nIsi:\n${sampleText}\n\nRingkasan (3-5 poin):`,
    });
    summary = text.trim();
  } catch (summaryError) {
    // Swallowed — the summary is a nicety and must not fail an index that is
    // otherwise complete. Logged, because with a company Groq key in play this
    // can fail for every document of one tenant, and a bare `catch {}` made that
    // indistinguishable from a model that simply had nothing to say.
    console.error(`[indexing] Summary generation failed for ${doc.name}:`, summaryError);
  }

  // One transaction for the whole write, so a re-index never leaves a document
  // with its old chunks deleted and its new ones missing. The delete is what
  // makes indexing repeatable: without it, a second pass over the same document
  // would double every chunk in retrieval.
  await withTenant(companyId, async (tx) => {
    // The document row is updated *first*, and only if `indexing_started_at` is
    // still the value our claim wrote. Both halves of that matter.
    //
    // The condition is the fence. A claim is exclusive, but it is not permanent:
    // sweepStuckDocuments returns a document to the queue after
    // STUCK_AFTER_MS, and a second pass then claims it and overwrites
    // `indexing_started_at`. Today that cannot bite, because the platform kills
    // an invocation at maxDuration = 300s and the sweep only fires at 600s — an
    // invariant held together by two constants in different files, one of which
    // is not ours. Off Vercel there is no such kill, and neither the embedding
    // call nor the summary call has a timeout, so a provider that hangs rather
    // than refusing has no upper bound at all.
    //
    // It runs first so that a superseded worker finds out *before* it touches
    // the chunk table. Nothing about the ordering is subtle — it is not a lock
    // that saves us here. Postgres evaluates a WHERE before it locks a row, so a
    // worker whose lease no longer matches never blocks and never waits: it gets
    // zero rows back straight away, throws, and rolls back without having
    // deleted or inserted a single chunk. (Measured, not assumed: the losing
    // UPDATE returns immediately rather than blocking on the winner's open
    // transaction.) The chunk table is where a mistake would be silent, so the
    // rule is simply never to reach it without a valid claim.
    const kept = await tx.update(documents)
      .set({ status: "success", summary, errorMessage: null })
      .where(stillOurs(doc))
      .returning({ id: documents.id });

    if (kept.length === 0) {
      // Two ways to get here, and they are worth telling apart in the log. The
      // row was re-claimed by another pass, or the admin deleted the document
      // while it was being indexed — the second is not a fault at all, and
      // reporting it as one sends someone looking for a race that never
      // happened. One extra indexed lookup, on a path that should be rare.
      const [survivor] = await tx.select({ id: documents.id })
        .from(documents).where(eq(documents.id, doc.id));
      throw new ClaimLostError(
        survivor
          ? `Document ${doc.id} was re-claimed by another pass while it was being indexed`
          : `Document ${doc.id} was deleted while it was being indexed`
      );
    }

    await tx.delete(documentChunks).where(eq(documentChunks.documentId, doc.id));
    await tx.insert(documentChunks).values(
      chunks.map((text, i) => ({
        id: randomUUID(),
        documentId: doc.id,
        companyId,
        text,
        embedding: embeddings[i],
        chunkIndex: i,
      }))
    );
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
  const budgetMs = opts.budgetMs ?? INDEX_RUN_BUDGET_MS;
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
        await embedAndStore(companyId, doc, company);
        indexed++;
      } catch (error) {
        if (error instanceof ClaimLostError) {
          // Someone else owns this document and is indexing it right now.
          // Nothing to record, nothing to requeue — touching the row is the one
          // thing that would actually cause harm. Move on to the next document.
          console.warn(`[indexing] ${error.message}`);
          continue;
        }

        if (error instanceof RetryableError) {
          // Put it back and stop the pass. Marching on to the next document
          // would just collect the same 429 for every remaining one, and burn
          // the whole budget doing it.
          console.warn(`[indexing] Rate limited on ${doc.name}, requeued:`, error.message);
          await withTenant(companyId, (tx) =>
            tx.update(documents).set({ status: "queued" }).where(stillOurs(doc)));
          stop = "rate-limited";
          break;
        }

        console.error(`[indexing] Error indexing ${doc.name}:`, error);
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
