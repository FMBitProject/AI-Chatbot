// Shared between the manual upload route (@/app/api/admin/upload) and the
// Google Drive import route (@/app/api/admin/google-drive/import) — both end
// up with a Buffer + a filename, just from a different source (multipart
// FormData vs a Drive API download), and need identical parsing behavior so a
// document reads the same regardless of how it entered the system.

import { AppError, type ErrorCode } from "./errors";

// Failures an admin can actually act on (a scanned PDF, a corrupt file, a
// password-protected one) carry a specific message that gets stored on the
// document row and shown in the admin UI. Everything else falls back to a
// generic message, with the real detail left in the server log.
//
// Under AppError rather than Error, because that promise — "this message was
// written for an admin to read" — is exactly what `userMessage` means, and
// saying it in the type saves every call site from having to remember it. The
// default status is 400: the common case is a file this system cannot make
// sense of, which the caller fixes by uploading a different one. `code` and
// `statusCode` are overridable for the cases that are not, notably the Drive
// fetch failures in @/lib/google-drive — somebody else's outage, which should
// not be reported as a bad request.
export class DocumentError extends AppError {
  constructor(
    message: string,
    options: { code?: ErrorCode; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message, options.code ?? "VALIDATION_ERROR", options.statusCode ?? 400, {
      userMessage: message,
      cause: options.cause,
    });
  }
}

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
export async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  polyfillSumPrecise();
  const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdf(pdf, { mergePages: true });
    return text;
  } catch (error) {
    console.error(`[document-extraction] pdf.js could not parse ${fileName}:`, error);
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

export async function unwrapParseError(
  fileName: string,
  format: string,
  parse: () => Promise<string>,
): Promise<string> {
  try {
    return await parse();
  } catch (error) {
    console.error(`[document-extraction] ${format} parser could not read ${fileName}:`, error);
    throw new DocumentError(
      `File ${format} ini tidak bisa dibaca — kemungkinan filenya rusak atau ekstensinya ` +
      `tidak sesuai isinya. Coba buka lalu simpan ulang dari aplikasi aslinya, kemudian upload lagi.`
    );
  }
}

// Takes a Buffer + filename directly rather than a File, so a caller that
// already has raw bytes (a Drive download) doesn't need to wrap them in a
// synthetic File just to satisfy this signature.
export async function extractText(buffer: Buffer, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();

  if (name.endsWith(".pdf")) {
    return extractPdfText(buffer, fileName);
  }

  // The Office parsers get the same treatment as the PDF path above: their raw
  // exceptions ("Corrupted zip", "central directory not found") reach the admin
  // as "kesalahan tak terduga di server", which reads like our bug rather than
  // their file. Both formats are zip containers, so a truncated or renamed file
  // is the common cause and the advice is the same for all three.
  if (name.endsWith(".docx")) {
    return unwrapParseError(fileName, "DOCX", async () => {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    });
  }

  if (name.endsWith(".xlsx")) {
    // Parsed via officeparser (like pptx below) instead of the abandoned `xlsx`
    // package, which has unpatched prototype-pollution/ReDoS advisories in its
    // parser. The "csv" destination keeps the tabular structure for retrieval.
    return unwrapParseError(fileName, "XLSX", async () => {
      const { parseOffice } = await import("officeparser");
      const ast = await parseOffice(buffer, { fileType: "xlsx" });
      const { value: text } = await ast.to("csv");
      return text as string;
    });
  }

  if (name.endsWith(".pptx")) {
    return unwrapParseError(fileName, "PPTX", async () => {
      const { parseOffice } = await import("officeparser");
      const ast = await parseOffice(buffer, { fileType: "pptx" });
      const { value: text } = await ast.to("text");
      return text as string;
    });
  }

  throw new DocumentError(
    `Format file "${fileName}" tidak didukung. Gunakan PDF, DOCX, XLSX, atau PPTX.`
  );
}
