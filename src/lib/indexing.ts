import { and, eq, sql } from "drizzle-orm";
import { generateText } from "ai";
import { groq, createGroq } from "@ai-sdk/groq";
import { randomUUID } from "crypto";
import { withTenant } from "@/lib/db/tenant";
import { documents, documentChunks } from "@/lib/db/schema";
import { chunkText } from "@/lib/chunker";
import { getEmbeddings, EmbeddingBudgetExceededError } from "@/lib/embeddings";
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
// belongs to an invocation that died — a timeout, a deploy, a crash. Well past
// any single document's real processing time, so a genuinely running index in a
// parallel invocation can never be swept out from under itself.
const STUCK_AFTER_MS = 10 * 60 * 1000;

// How long one indexing pass may keep working before returning. The worker route
// declares maxDuration = 300, and a document can spend up to ~120s inside
// getEmbeddings' own retry budget, so stopping here leaves room to finish the
// document in flight and still answer the caller. Whatever is left stays
// "queued" and the next pass picks it up — the queue is the progress record, so
// stopping early costs nothing.
export const INDEX_RUN_BUDGET_MS = 150 * 1000;

// Why a pass stopped, so the caller knows whether to come straight back.
export type PassStop = "drained" | "budget" | "rate-limited";

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

interface ClaimedDocument {
  id: string;
  name: string;
  rawText: string;
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
        sql`${documents.createdAt} < now() - ${sql.raw(`interval '${STUCK_AFTER_MS} milliseconds'`)}`,
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
        sql`${documents.createdAt} < now() - ${sql.raw(`interval '${STUCK_AFTER_MS} milliseconds'`)}`,
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
async function claimNextDocument(companyId: string): Promise<ClaimedDocument | null> {
  const rows = await withTenant(companyId, async (tx) => {
    const result = await tx.execute(sql`
      update ${documents} set status = 'processing'
      where id = (
        select id from ${documents}
        where company_id = ${companyId}
          and status = 'queued'
          and raw_text is not null
        order by created_at asc, id asc
        limit 1
        for update skip locked
      )
      returning id, name, raw_text
    `);
    return result.rows as { id: string; name: string; raw_text: string }[];
  });

  const row = rows[0];
  return row ? { id: row.id, name: row.name, rawText: row.raw_text } : null;
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
            and created_at < now() - ${sql.raw(`interval '${STUCK_AFTER_MS} milliseconds'`)}
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

  let embeddings: number[][];
  try {
    embeddings = await getEmbeddings(chunks, company.geminiApiKey);
  } catch (error) {
    console.error(`[indexing] Embedding failed for ${doc.name}:`, error);
    const ownKey = !!company.geminiApiKey;
    // Any 429 counts as rate limiting, not just the budget error: when the
    // provider's retry-after is short, five attempts can be spent inside the
    // budget and the raw 429 propagates instead. Both mean "too fast", and
    // neither means "your key is wrong" — which is the one message that would
    // send an admin to revoke a perfectly good key.
    const isRateLimit =
      error instanceof EmbeddingBudgetExceededError ||
      (error instanceof Error && error.message.includes("429"));
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
  const groqClient = company.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;
  const sampleText = chunks.slice(0, 3).join("\n\n").slice(0, 2000);
  let summary: string | null = null;
  try {
    const { text } = await generateText({
      model: groqClient("llama-3.3-70b-versatile"),
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
    await tx.update(documents)
      .set({ status: "success", summary, errorMessage: null })
      .where(eq(documents.id, doc.id));
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
  if (stats.stuck > 0) await sweepStuckDocuments(companyId);

  let indexed = 0;
  let failed = 0;
  let stop: PassStop = "drained";

  while (Date.now() - startedAt < budgetMs) {
    const doc = await claimNextDocument(companyId);
    if (!doc) break;

    try {
      await embedAndStore(companyId, doc, company);
      indexed++;
    } catch (error) {
      if (error instanceof RetryableError) {
        // Put it back and stop the pass. Marching on to the next document would
        // just collect the same 429 for every remaining one, and burn the whole
        // budget doing it.
        console.warn(`[indexing] Rate limited on ${doc.name}, requeued:`, error.message);
        await withTenant(companyId, (tx) =>
          tx.update(documents).set({ status: "queued" }).where(eq(documents.id, doc.id)));
        stop = "rate-limited";
        break;
      }

      console.error(`[indexing] Error indexing ${doc.name}:`, error);
      const errorMessage = error instanceof IndexError
        ? error.message
        : "Dokumen gagal diindeks karena kesalahan tak terduga di server.";
      try {
        await withTenant(companyId, (tx) =>
          tx.update(documents).set({ status: "failed", errorMessage }).where(eq(documents.id, doc.id)));
        failed++;
      } catch (updateError) {
        // Leaves the row in "processing"; the sweep at the top of the next pass
        // returns it to the queue. Not derailing the rest of the batch matters
        // more than recording this one reason.
        console.error(`[indexing] Could not mark ${doc.name} as failed:`, updateError);
      }
    }
  }

  const remaining = (await queueStats(companyId)).queued;
  if (stop === "drained" && remaining > 0) stop = "budget";

  return { indexed, failed, remaining, stop };
}

// Puts a document back in the queue — used by the "index ulang" action on a
// failed row. Only documents whose text is still stored can be requeued; one
// that failed during parsing has nothing to index and needs the file again.
export async function requeueDocument(companyId: string, documentId: string): Promise<boolean> {
  const updated = await withTenant(companyId, (tx) =>
    tx.update(documents)
      .set({ status: "queued", errorMessage: null })
      .where(and(
        eq(documents.id, documentId),
        eq(documents.companyId, companyId),
        eq(documents.status, "failed"),
        sql`${documents.rawText} is not null`,
      ))
      .returning({ id: documents.id }));
  return updated.length > 0;
}
