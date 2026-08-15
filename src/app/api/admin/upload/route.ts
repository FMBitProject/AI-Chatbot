import { NextRequest, NextResponse } from "next/server";

// Parsing only — no third-party call happens in this request any more, so the
// old five-minute allowance is no longer load-bearing. It stays because a large
// scanned PDF can still take a while to walk on a cold function, and there is
// nothing to gain from cutting a request short that has a file in hand.
export const maxDuration = 300;
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { documents } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { isUnderLimit } from "@/lib/plan-limits";
import { resolvePlanById } from "@/lib/subscription";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";
import { randomUUID } from "crypto";
import { DocumentError, extractText } from "@/lib/document-extraction";
import { queueDocument, recordDocumentFailure, resolveFolderParam } from "@/lib/document-ingest";

/**
 * Receives uploaded files, extracts their text, and queues them for indexing.
 *
 * This handler deliberately does *not* embed anything. Everything it does is
 * local and bounded — parse the bytes, write a row — so a 500-file import is
 * 500 short requests instead of 500 requests that each wait on Gemini. The
 * embedding half lives in @/lib/indexing, driven by /api/admin/indexing and by
 * the nightly cron.
 *
 * What that buys, concretely: a rate limit or a deploy in the middle of an
 * import no longer destroys work. The text is already stored, so indexing
 * resumes from `documents.raw_text` without the file ever being uploaded again.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  // The limits of the plan that is in force right now, not the one the company
  // last bought (see resolvePlan). The BYOK keys on the company row are not
  // needed here any more — nothing in this request talks to Gemini or Groq.
  const { subscription, limits } = await resolvePlanById(companyId);

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  // Where these documents go, applied to every file in the batch — the upload UI
  // asks once per drop, not once per file.
  //
  // Stored in `documents.department`, whose meaning follows the workspace: a
  // folder for an individual, the owning department for a company (see the note
  // in @/lib/db/schema).
  //
  // Refused rather than dropped when it is unusable. Degrading a too-long name
  // to null files the whole batch as unfiled and answers 200, so the admin is
  // told the upload worked and only finds out where the documents went by
  // looking — and with a large import, by looking through a lot of rows. A file
  // is cheap to re-send; a batch silently filed in the wrong place is not cheap
  // to sort out. Refusing before any parsing also means nothing is stored yet.
  const folderResult = resolveFolderParam(formData.get("folder"));
  if ("error" in folderResult) {
    return NextResponse.json({ error: folderResult.error }, { status: 400 });
  }
  const { folder } = folderResult;

  if (!files.length) {
    return NextResponse.json({ error: "Tidak ada file yang dikirim." }, { status: 400 });
  }

  const results: { id: string; name: string; status: string; department: string | null; errorMessage?: string; createdAt: string }[] = [];
  const limitMessage = `Batas dokumen paket ${subscription.plan} sudah tercapai (${limits.maxDocuments} dokumen). Upgrade paket untuk menambah lebih banyak.`;
  let limitReached = false;

  for (const file of files) {
    // `formData.getAll` returns strings for non-file fields, and the cast above
    // does not stop one arriving. Without this, `file.name` is undefined and the
    // TypeError escapes the per-file try below — the whole request 500s and the
    // files already processed lose their results.
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Permintaan upload tidak valid: field \"files\" harus berisi file.", documents: results },
        { status: 400 }
      );
    }

    // Counted again for every file, not once for the request.
    //
    // The check used to run before formData was even parsed, and then the
    // handler looped over every file in it. A company one document below its cap
    // could send fifty files in a single request and index all fifty — the cap
    // held only against admins who uploaded one file at a time, which is exactly
    // the admin who was never the problem. It guts the reason to upgrade, so it
    // is fixed here rather than left for the billing work.
    //
    // This one is only an optimisation: it stops us parsing a file that is
    // already over the cap. The check that actually enforces the limit runs
    // inside the insert transaction below, because this one cannot — between the
    // count and the insert there is a whole PDF being parsed, and any number of
    // other requests can insert during it.
    const [{ count: docCount }] = await withTenant(companyId, (tx) =>
      tx.select({ count: count() }).from(documents).where(eq(documents.companyId, companyId)));
    if (!isUnderLimit(docCount, limits.maxDocuments)) {
      limitReached = true;
      break;
    }

    // Belt and braces behind the platform. Vercel rejects a body over 4.5 MB
    // before this handler is reached, so a file this size normally never gets
    // here — but the limit is ours to state, and a self-hosted or local run has
    // no platform limit at all. The files already stored travel with the error:
    // refusing one file is no reason to hide what happened to the others.
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File "${file.name}" melebihi batas ${MAX_UPLOAD_MB} MB.`, documents: results },
        { status: 413 }
      );
    }

    const safeName = file.name.replace(/[^\w.\- ]/g, "").trim() || "upload";
    const docId = randomUUID();
    const createdAt = new Date().toISOString();

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = await extractText(buffer, file.name);

      // No text at all means the file holds images rather than a text layer — a
      // scan or a photo saved as a PDF. Caught here, where the file is still in
      // hand, so the admin hears about it in the upload response instead of
      // minutes later from the indexer. The "there is text, but too little to
      // chunk" case needs chunkText and belongs to the indexer.
      if (rawText.trim().length === 0) {
        throw new DocumentError(
          "Tidak ada teks yang bisa diambil dari file ini — isinya kemungkinan gambar, " +
          "bukan teks. Kalau dokumennya hasil scan atau foto, jalankan OCR dulu supaya " +
          "teksnya terbaca."
        );
      }

      // Written once, already in its resting state: there is no long-running
      // work left in this request for it to be interrupted by, so the row never
      // needs a "processing" phase here. See queueDocument for why the count +
      // insert has to be one locked transaction.
      const stored = await queueDocument({
        companyId,
        maxDocuments: limits.maxDocuments,
        docId,
        name: safeName,
        department: folder,
        rawText,
      });

      if (!stored) {
        // Another request took the last slot while this file was being parsed.
        // The same answer as the pre-check above, reached a few seconds later.
        limitReached = true;
        break;
      }

      results.push({ id: docId, name: file.name, status: "queued", department: folder, createdAt });

    } catch (error) {
      console.error(`[upload] Error processing ${file.name}:`, error);
      // Persist why it failed, so the admin sees the reason in the document list
      // instead of a bare "Gagal" badge that sends them digging through the logs.
      const errorMessage = error instanceof DocumentError
        ? error.message
        : "Dokumen gagal diproses karena kesalahan tak terduga di server.";
      // A throw here would escape the handler: the request would 500, the
      // remaining files in the batch would never be processed, and the caller
      // would lose the per-file results collected so far. Recording the reason
      // is a nicety; not derailing the batch is not.
      try {
        await recordDocumentFailure({ companyId, docId, name: safeName, department: folder, errorMessage });
      } catch (insertError) {
        console.error(`[upload] Could not record failure for ${file.name}:`, insertError);
      }
      results.push({ id: docId, name: file.name, status: "failed", department: folder, errorMessage, createdAt });
    }
  }

  // The cap was hit. With nothing accepted this is a plain refusal; with part of
  // the batch already stored it is a partial success, and answering 403 would
  // throw away the results the caller needs to know about.
  if (limitReached && results.length === 0) {
    return NextResponse.json({ error: limitMessage }, { status: 403 });
  }

  return NextResponse.json({
    documents: results,
    ...(limitReached ? { error: limitMessage } : {}),
  });
}
