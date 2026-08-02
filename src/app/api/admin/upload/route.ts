import { NextRequest, NextResponse } from "next/server";

// Allow up to 5 minutes — needed when waiting for Gemini 429 retry delays
export const maxDuration = 300;
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { documents, documentChunks, users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { isUnderLimit } from "@/lib/plan-limits";
import { resolvePlanById } from "@/lib/subscription";
import { chunkText } from "@/lib/chunker";
import { getEmbeddings } from "@/lib/embeddings";
import { generateText } from "ai";
import { groq, createGroq } from "@ai-sdk/groq";
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

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = dbUser.companyId;

  // Enforce the limits of the plan that is in force right now, not the one the
  // company last bought (see resolvePlan).
  // `company` comes free with the plan lookup — it is the same row — and is
  // needed here for the BYOK embedding key, not just for the limits.
  const { company, subscription, limits } = await resolvePlanById(companyId);
  const [{ count: docCount }] = await withTenant(companyId, (tx) =>
    tx.select({ count: count() }).from(documents).where(eq(documents.companyId, companyId)));
  if (!isUnderLimit(docCount, limits.maxDocuments)) {
    return NextResponse.json({
      error: `Batas dokumen paket ${subscription.plan} sudah tercapai (${limits.maxDocuments} dokumen). Upgrade paket untuk menambah lebih banyak.`,
    }, { status: 403 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "Tidak ada file yang dikirim." }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  const results: { id: string; name: string; status: string; errorMessage?: string; createdAt: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" melebihi batas 10 MB.` },
        { status: 413 }
      );
    }

    const safeName = file.name.replace(/[^\w.\- ]/g, "").trim() || "upload";
    const docId = randomUUID();
    await withTenant(companyId, (tx) => tx.insert(documents).values({
      id: docId,
      name: safeName,
      companyId,
      status: "processing",
    }));

    try {
      const rawText = await extractText(file);
      const chunks = chunkText(rawText);

      // A file that yields no usable text would otherwise reach insert().values([])
      // below, which throws a Drizzle error that says nothing about the cause.
      // Two very different situations end up here and the advice differs, so tell
      // them apart by whether any text came out at all: nothing means the file
      // holds images rather than a text layer (a scan or photo saved as a PDF),
      // while a little means a real but too-short document — chunkText drops
      // anything under MIN_CHUNK, and OCR would be useless advice for that.
      if (chunks.length === 0) {
        throw new DocumentError(
          rawText.trim().length === 0
            ? "Tidak ada teks yang bisa diambil dari file ini — isinya kemungkinan gambar, " +
              "bukan teks. Kalau dokumennya hasil scan atau foto, jalankan OCR dulu supaya " +
              "teksnya terbaca."
            : "Isi dokumen ini terlalu pendek untuk diindeks. Tambahkan isinya dulu, " +
              "lalu upload lagi."
        );
      }

      // Batch embed all chunks in one API call instead of N sequential calls
      let embeddings: number[][];
      try {
        embeddings = await getEmbeddings(chunks, company?.geminiApiKey);
      } catch (error) {
        console.error(`[upload] Embedding failed for ${file.name}:`, error);
        throw new DocumentError(
          "Gagal membuat index AI untuk dokumen ini — layanan embedding sedang bermasalah " +
          "atau kuotanya habis. Coba upload lagi beberapa menit lagi."
        );
      }

      // The insert below pairs chunk i with embedding i. A short array would not
      // error — `embedding` is nullable, so the missing tail would be stored as
      // NULL and the document would be marked "success" while part of it stayed
      // invisible to every search. Fail loudly instead; a silent half-indexed
      // document is worse than a failed upload the admin can retry.
      if (embeddings.length !== chunks.length) {
        console.error(
          `[upload] Embedding count mismatch for ${file.name}: got ${embeddings.length} for ${chunks.length} chunks`
        );
        throw new DocumentError(
          "Index AI dokumen ini tidak lengkap terbentuk, jadi tidak disimpan supaya " +
          "isinya tidak sebagian-sebagian saat dicari. Coba upload lagi."
        );
      }

      await withTenant(companyId, (tx) => tx.insert(documentChunks).values(
        chunks.map((text, i) => ({
          id: randomUUID(),
          documentId: docId,
          companyId,
          text,
          embedding: embeddings[i],
          chunkIndex: i,
        }))
      ));

      // Auto-generate document summary. Uses the company's own Groq key when
      // there is one, like every other generation call: this prompt carries the
      // opening 2000 characters of the uploaded file, so it is document content
      // leaving the server, not metadata.
      const sampleText = chunks.slice(0, 3).join("\n\n").slice(0, 2000);
      let summary: string | null = null;
      try {
        const groqClient = company?.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;
        const { text } = await generateText({
          model: groqClient("llama-3.3-70b-versatile"),
          prompt: `Buat ringkasan profesional dari dokumen berikut dalam 3-5 poin utama menggunakan Bahasa Indonesia. Format: bullet points singkat dan jelas. Dokumen: "${file.name}"\n\nIsi:\n${sampleText}\n\nRingkasan (3-5 poin):`,
        });
        summary = text.trim();
      } catch {}

      await withTenant(companyId, (tx) =>
        tx.update(documents).set({ status: "success", summary, rawText }).where(eq(documents.id, docId)));
      results.push({ id: docId, name: file.name, status: "success", createdAt: new Date().toISOString() });

    } catch (error) {
      console.error(`[upload] Error processing ${file.name}:`, error);
      // Persist why it failed, so the admin sees the reason in the document list
      // instead of a bare "Gagal" badge that sends them digging through the logs.
      const errorMessage = error instanceof DocumentError
        ? error.message
        : "Dokumen gagal diproses karena kesalahan tak terduga di server.";
      // This runs inside a catch, so a throw here would escape the handler: the
      // request would 500, the remaining files in the batch would never be
      // processed, and the caller would lose the per-file results collected so
      // far. Recording why it failed is a nicety; not derailing the batch is not.
      try {
        await withTenant(companyId, (tx) =>
          tx.update(documents).set({ status: "failed", errorMessage }).where(eq(documents.id, docId)));
      } catch (updateError) {
        console.error(`[upload] Could not mark ${file.name} as failed:`, updateError);
      }
      results.push({ id: docId, name: file.name, status: "failed", errorMessage, createdAt: new Date().toISOString() });
    }
  }

  return NextResponse.json({ documents: results });
}
