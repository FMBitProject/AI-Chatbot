// Server-side helpers for the "import from Google Drive" admin feature.
// Deliberately thin: the browser (via Google Identity Services + Picker,
// see @/components/admin/GoogleDrivePicker) is what talks to Google for
// authorization and file selection. This module only ever receives an
// already-issued access token and uses it to fetch metadata/bytes — it never
// requests, stores, or refreshes a token itself. See the plan doc for why
// this feature deliberately has no server-side OAuth flow or token table:
// it is a one-time import, not a standing connection like Slack's.
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { DocumentError, extractText } from "@/lib/document-extraction";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

// Bounds every single Drive API call, independent of the route's own
// maxDuration=300 for the whole batch. Without this, one network partition
// or a Google-side hang on file N pins the request open until the platform
// kills the entire function — every file after N is never even attempted,
// and the admin waits the full 5 minutes to find out. Metadata calls are
// tiny (30s is generous); downloads/exports get more headroom for a file
// near MAX_UPLOAD_BYTES on a slow connection.
const METADATA_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

// Deliberately narrow: only ordinary binary files (pdf/docx/xlsx/pptx), the
// same formats manual upload accepts. Native Google Docs/Sheets/Slides are
// refused rather than exported — Drive reports no size for them up front
// (they hold no binary bytes of their own), so accepting them means
// downloading a full export before it's even known whether the result fits
// MAX_UPLOAD_BYTES. A large enough Sheet/Doc turns one picked file into a
// real chunk of wasted memory and time on every attempt, for a feature whose
// entire job is turning a picked file into text quickly. GoogleDrivePicker's
// PICKER_MIME_TYPES list must be kept in sync with this — it's what stops an
// admin from picking one of these in the first place, this is what refuses
// it if they somehow do anyway (a stale client build, a hand-crafted
// request).
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
]);

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

async function driveFetch(path: string, accessToken: string, timeoutMs: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${DRIVE_API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Covers both AbortSignal.timeout firing and a lower-level network
    // failure (DNS, connection reset) — from the caller's perspective both
    // mean "Google never answered in time", and both need a message that
    // doesn't imply the file itself is the problem.
    console.error(`[google-drive] ${path} did not complete:`, error);
    throw new DocumentError(
      "Google Drive tidak merespons tepat waktu untuk file ini. Coba lagi sebentar lagi.",
      { code: "UPSTREAM_ERROR", statusCode: 502, cause: error }
    );
  }
  if (res.status === 401) {
    // Deliberately left at the default 400 rather than 401. This is Google's
    // token expiring, not ours, and a 401 leaving this app is the signal a
    // client uses to decide the user has been signed out — answering one here
    // would sign an admin out of IntelliBase because their Drive grant lapsed.
    throw new DocumentError(
      "Sesi Google Drive sudah berakhir. Klik \"Sambungkan Google Drive\" lagi lalu pilih ulang filenya."
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[google-drive] ${path} failed: ${res.status} ${body}`);
    throw new DocumentError(
      "Google Drive tidak bisa dihubungi untuk file ini. Coba lagi sebentar lagi.",
      { code: "UPSTREAM_ERROR", statusCode: 502 }
    );
  }
  return res;
}

// Hand-rolled rather than a schema library (this codebase has none — see
// @/lib/validate) — Drive's response is a flat, three-required-field shape,
// which a library would not make meaningfully safer than checking directly.
// Guards against a malformed/unexpected response body (a Drive API change, a
// proxy mangling the response) reaching the rest of the pipeline as
// `undefined` and throwing later from somewhere that isn't expecting it —
// notably meta.name, which downstream code calls .replace()/.toLowerCase()
// on unconditionally.
function parseDriveMetadata(data: unknown): DriveFileMetadata {
  if (
    typeof data !== "object" || data === null ||
    typeof (data as Record<string, unknown>).id !== "string" ||
    typeof (data as Record<string, unknown>).name !== "string" ||
    typeof (data as Record<string, unknown>).mimeType !== "string"
  ) {
    console.error("[google-drive] unexpected metadata shape:", data);
    throw new DocumentError(
      "Google Drive mengirim data file yang tidak dikenali. Coba lagi.",
      { code: "UPSTREAM_ERROR", statusCode: 502 }
    );
  }
  const d = data as { id: string; name: string; mimeType: string; size?: unknown };
  const size = typeof d.size === "string" && d.size !== "" ? Number(d.size) : null;
  return {
    id: d.id,
    name: d.name,
    mimeType: d.mimeType,
    size: size !== null && Number.isFinite(size) ? size : null,
  };
}

export async function getDriveFileMetadata(accessToken: string, fileId: string): Promise<DriveFileMetadata> {
  const res = await driveFetch(`/files/${fileId}?fields=id,name,mimeType,size`, accessToken, METADATA_TIMEOUT_MS);
  return parseDriveMetadata(await res.json().catch(() => null));
}

function checkSize(name: string, byteLength: number) {
  if (byteLength > MAX_UPLOAD_BYTES) {
    throw new DocumentError(
      `File "${name}" terlalu besar untuk diimpor (melebihi batas ukuran dokumen).`
    );
  }
}

// Downloads the file's raw bytes. Enforces MAX_UPLOAD_BYTES from
// Drive-reported size up front — before any bytes are pulled over the wire —
// and re-checks the actual bytes after, belt and braces against a metadata
// response that under-reported size.
async function downloadDriveFile(accessToken: string, meta: DriveFileMetadata): Promise<Buffer> {
  if (meta.size !== null) checkSize(meta.name, meta.size);
  const res = await driveFetch(`/files/${meta.id}?alt=media`, accessToken, DOWNLOAD_TIMEOUT_MS);
  const arrayBuffer = await res.arrayBuffer();
  checkSize(meta.name, arrayBuffer.byteLength);
  return Buffer.from(arrayBuffer);
}

// Downloads a picked Drive file and returns its plain text, using the same
// parsers as manual upload (@/lib/document-extraction). Refuses anything
// that isn't an ordinary pdf/docx/xlsx/pptx — see SUPPORTED_MIME_TYPES for
// why native Google Docs/Sheets/Slides are out of scope entirely rather than
// exported.
export async function importDriveFileText(accessToken: string, meta: DriveFileMetadata): Promise<string> {
  if (!SUPPORTED_MIME_TYPES.has(meta.mimeType)) {
    throw new DocumentError(
      `"${meta.name}" adalah dokumen Google Docs/Sheets/Slides asli, yang belum didukung untuk impor langsung. ` +
      `Export dulu jadi PDF/DOCX/XLSX/PPTX dari Google Drive, lalu pilih hasil export-nya.`
    );
  }
  const buffer = await downloadDriveFile(accessToken, meta);
  return extractText(buffer, meta.name);
}
