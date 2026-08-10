import { NextRequest, NextResponse } from "next/server";

// Parsing only — no third-party call happens in this request any more, so the
// old five-minute allowance is no longer load-bearing. It stays because a large
// scanned PDF can still take a while to walk on a cold function, and there is
// nothing to gain from cutting a request short that has a file in hand.
export const maxDuration = 300;
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
// Aliased: `companies` is also the name of the plan-limits concept all over this
// file's neighbours, and an unqualified import here reads like the plan rather
// than the table it locks.
import { companies as companiesTable, documents } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { isUnderLimit } from "@/lib/plan-limits";
import { resolvePlanById } from "@/lib/subscription";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";
import { randomUUID } from "crypto";

// Failures an admin can actually act on (a scanned PDF, a corrupt file, a
// password-protected one) carry a specific message that gets stored on the
// document row and shown in the admin UI. Everything else falls back to a
// generic message, with the real detail left in the server log.
class DocumentError extends Error {}

// pdf.js (bundled inside unpdf) calls Math.sumPrecise, which only lands in
// Node 24. On older runtimes every page logs a TypeError warning, so provide it
// before the library loads. Extraction output is identical either way.
//
// Neumaier compensated summation rather than a plain loop, because this is
// installed on the *global* Math: anything else that feature-detects the method
// gets this implementation, so it has to be worth having. Be honest about the
// limit — the specification returns the exactly-rounded sum, and this returns a
// very close approximation. It is well inside what pdf.js needs for glyph
// widths, and it is removed the moment the runtime ships its own.
function polyfillSumPrecise() {
  const M = Math as typeof Math & { sumPrecise?: (values: Iterable<number>) => number };
  if (typeof M.sumPrecise === "function") return;
  M.sumPrecise = (values) => {
    let sum = 0;
    let compensation = 0;
    for (const value of values) {
      const tentative = sum + value;
      // Accumulate the low-order bits that `sum + value` just discarded.
      compensation += Math.abs(sum) >= Math.abs(value)
        ? (sum - tentative) + value
        : (value - tentative) + sum;
      sum = tentative;
    }
    return sum + compensation;
  };
}

// Extracted with unpdf, which wraps a current pdf.js. The previous parser
// (pdf-parse@1.1.1) shipped a frozen copy of pdf.js 1.10.100 from 2018 and
// rejected ordinary PDFs with lexer-level errors — "bad XRef entry",
// "FormatError: Illegal character" — that modern pdf.js recovers from.
async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  polyfillSumPrecise();
  const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdf(pdf, { mergePages: true });
    return text;
  } catch (error) {
    console.error(`[upload] pdf.js could not parse ${fileName}:`, error);
    if (error instanceof Error && error.name === "PasswordException") {
      throw new DocumentError(
        "PDF ini diproteksi password. Buka proteksinya dulu, lalu upload ulang."
      );
    }
    throw new DocumentError(
      "PDF ini tidak bisa dibaca — kemungkinan filenya rusak. Coba buka di PDF reader, " +
      "lalu simpan ulang atau print ke PDF, kemudian upload lagi."
    );
  }
}

async function unwrapParseError(
  fileName: string,
  format: string,
  parse: () => Promise<string>,
): Promise<string> {
  try {
    return await parse();
  } catch (error) {
    console.error(`[upload] ${format} parser could not read ${fileName}:`, error);
    throw new DocumentError(
      `File ${format} ini tidak bisa dibaca — kemungkinan filenya rusak atau ekstensinya ` +
      `tidak sesuai isinya. Coba buka lalu simpan ulang dari aplikasi aslinya, kemudian upload lagi.`
    );
  }
}

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    return extractPdfText(buffer, file.name);
  }

  // The Office parsers get the same treatment as the PDF path above: their raw
  // exceptions ("Corrupted zip", "central directory not found") reach the admin
  // as "kesalahan tak terduga di server", which reads like our bug rather than
  // their file. Both formats are zip containers, so a truncated or renamed file
  // is the common cause and the advice is the same for all three.
  if (name.endsWith(".docx")) {
    return unwrapParseError(file.name, "DOCX", async () => {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    });
  }

  if (name.endsWith(".xlsx")) {
    // Parsed via officeparser (like pptx below) instead of the abandoned `xlsx`
    // package, which has unpatched prototype-pollution/ReDoS advisories in its
    // parser. The "csv" destination keeps the tabular structure for retrieval.
    return unwrapParseError(file.name, "XLSX", async () => {
      const { parseOffice } = await import("officeparser");
      const ast = await parseOffice(buffer, { fileType: "xlsx" });
      const { value: text } = await ast.to("csv");
      return text as string;
    });
  }

  if (name.endsWith(".pptx")) {
    return unwrapParseError(file.name, "PPTX", async () => {
      const { parseOffice } = await import("officeparser");
      const ast = await parseOffice(buffer, { fileType: "pptx" });
      const { value: text } = await ast.to("text");
      return text as string;
    });
  }

  throw new DocumentError(
    `Format file "${file.name}" tidak didukung. Gunakan PDF, DOCX, XLSX, atau PPTX.`
  );
}

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

  if (!files.length) {
    return NextResponse.json({ error: "Tidak ada file yang dikirim." }, { status: 400 });
  }

  const results: { id: string; name: string; status: string; errorMessage?: string; createdAt: string }[] = [];
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
      const rawText = await extractText(file);

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
      // needs a "processing" phase here.
      //
      // Counted and inserted inside one transaction, behind a lock on the
      // company row, because a cap enforced by "count, then insert" is not
      // enforced at all. Two tabs — or an admin on a laptop and the same admin
      // on a phone — both read 49 of 50, both insert, and the company owns 51
      // documents on a plan that sells 50. Nothing about it looks like a bug
      // afterwards: no error, no log, just a number that should have been
      // impossible.
      //
      // The lock is taken on `companies` rather than on the document rows
      // because there is no row to lock for a document that does not exist yet;
      // what needs serialising is the decision, and the tenant is what the
      // decision is about. It is held for a count and an insert — microseconds —
      // and the expensive part of this loop (parsing the file) has already
      // happened outside it, so uploads from one company queue up here only for
      // as long as it takes Postgres to answer two indexed queries.
      const stored = await withTenant(companyId, async (tx) => {
        await tx.select({ id: companiesTable.id })
          .from(companiesTable)
          .where(eq(companiesTable.id, companyId))
          .for("update");

        const [{ count: current }] = await tx.select({ count: count() })
          .from(documents)
          .where(eq(documents.companyId, companyId));
        if (!isUnderLimit(current, limits.maxDocuments)) return false;

        await tx.insert(documents).values({
          id: docId,
          name: safeName,
          companyId,
          status: "queued",
          rawText,
        });
        return true;
      });

      if (!stored) {
        // Another request took the last slot while this file was being parsed.
        // The same answer as the pre-check above, reached a few seconds later.
        limitReached = true;
        break;
      }

      results.push({ id: docId, name: file.name, status: "queued", createdAt });

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
        await withTenant(companyId, (tx) => tx.insert(documents).values({
          id: docId,
          name: safeName,
          companyId,
          status: "failed",
          errorMessage,
        }));
      } catch (insertError) {
        console.error(`[upload] Could not record failure for ${file.name}:`, insertError);
      }
      results.push({ id: docId, name: file.name, status: "failed", errorMessage, createdAt });
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
