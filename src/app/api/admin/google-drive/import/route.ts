import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireCompanyAdmin } from "@/lib/auth-guard";
import { resolvePlanById } from "@/lib/subscription";
import { canUseAiAnswers } from "@/lib/pricing";
import { DocumentError } from "@/lib/document-extraction";
import { queueDocument, recordDocumentFailure, resolveFolderParam } from "@/lib/document-ingest";
import { getDriveFileMetadata, importDriveFileText } from "@/lib/google-drive";

// Same allowance as the manual upload route (@/app/api/admin/upload) — a
// large scanned PDF exported from Drive takes just as long to walk as one
// dropped in directly, and this route does the same bounded, no-embedding
// work (parse the bytes, write a row).
export const maxDuration = 300;

/**
 * Imports admin-picked Google Drive files as queued documents — the Drive
 * equivalent of @/app/api/admin/upload, sourcing bytes from Drive's API
 * instead of a multipart request body.
 *
 * Called via fetch() from GoogleDrivePicker after the browser has already
 * completed Google's consent flow and picked files, so `accessToken` arrives
 * as a short-lived (~1h) bearer token issued directly to the browser. This
 * route only ever uses it to call the Drive API for the duration of this one
 * request — it is never logged, stored, or echoed back. See the plan doc for
 * why this feature has no server-side OAuth flow or stored refresh token: it
 * is a one-time import, not a standing connection like Slack's.
 *
 * Gated to Professional/Enterprise the same way Slack is (`canUseAiAnswers`),
 * enforced here regardless of what the client UI shows — the button is
 * hidden client-side for other plans, but this is the check that actually
 * matters.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCompanyAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const { subscription, limits } = await resolvePlanById(companyId);
  if (!canUseAiAnswers(subscription.plan)) {
    return NextResponse.json(
      { error: "Impor dari Google Drive tersedia di paket Professional dan Enterprise." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null) as {
    accessToken?: string;
    files?: { id?: string }[];
    folder?: string | null;
  } | null;

  const accessToken = body?.accessToken;
  // Real Google OAuth access tokens run well under this; the cap exists only
  // to refuse an obviously-wrong payload before it's used as a header value,
  // not because a legitimate token could ever be this long.
  if (!accessToken || typeof accessToken !== "string" || accessToken.length > 2048) {
    return NextResponse.json({ error: "Token akses Google Drive tidak ada." }, { status: 400 });
  }

  const folderResult = resolveFolderParam(body?.folder);
  if ("error" in folderResult) {
    return NextResponse.json({ error: folderResult.error }, { status: 400 });
  }
  const { folder } = folderResult;

  // Bounds one request to the same rough scale as a manual multi-file drop —
  // this route is one all-or-nothing HTTP request for the whole batch
  // (unlike upload's one-request-per-file loop), so an unbounded batch risks
  // hitting maxDuration mid-way with no partial-progress feedback at all.
  // Checked before filtering too, so a payload claiming an absurd number of
  // entries is refused before anything iterates over it.
  const rawFiles = Array.isArray(body?.files) ? body.files : [];
  if (rawFiles.length > 200) {
    return NextResponse.json(
      { error: "Maksimal 200 file per impor. Pilih dalam beberapa batch yang lebih kecil." },
      { status: 400 },
    );
  }
  // Real Drive file IDs are ~25-100 characters; 256 is headroom, not a
  // real-world ceiling — this only exists to refuse a malformed id before
  // it's spliced into a Drive API URL.
  const fileRefs = rawFiles.filter(
    (f): f is { id: string } => typeof f?.id === "string" && f.id.length > 0 && f.id.length <= 256,
  );
  if (!fileRefs.length) {
    return NextResponse.json({ error: "Tidak ada file Drive yang dipilih." }, { status: 400 });
  }

  // driveFileId (the picked file's Drive id, distinct from `id`, the new
  // document row's own id) is what lets the client tell which of the files
  // it sent actually got a result — see handleGoogleDriveImport in
  // admin/page.tsx. Matching by array position would break the moment this
  // loop's order and the client's `files` order could ever diverge; matching
  // by name would break on two picked files sharing a name. The Drive file
  // id is the one value both sides already agree is unique.
  const results: { id: string; driveFileId: string; name: string; status: string; department: string | null; errorMessage?: string; createdAt: string }[] = [];
  const limitMessage = `Batas dokumen paket ${subscription.plan} sudah tercapai (${limits.maxDocuments} dokumen). Upgrade paket untuk menambah lebih banyak.`;
  let limitReached = false;

  for (const fileRef of fileRefs) {
    const docId = randomUUID();
    const createdAt = new Date().toISOString();
    // Placeholder in case metadata itself fails to load — replaced as soon as
    // it's known, same intent as the upload route's safeName.
    let displayName = fileRef.id;

    try {
      const meta = await getDriveFileMetadata(accessToken, fileRef.id);
      displayName = meta.name;
      const safeName = meta.name.replace(/[^\w.\- ]/g, "").trim() || "upload";

      const rawText = await importDriveFileText(accessToken, meta);

      if (rawText.trim().length === 0) {
        throw new DocumentError(
          "Tidak ada teks yang bisa diambil dari file ini — isinya kemungkinan gambar, " +
          "bukan teks. Kalau dokumennya hasil scan atau foto, jalankan OCR dulu supaya " +
          "teksnya terbaca."
        );
      }

      const stored = await queueDocument({
        companyId,
        maxDocuments: limits.maxDocuments,
        docId,
        name: safeName,
        department: folder,
        rawText,
      });

      if (!stored) {
        limitReached = true;
        break;
      }

      results.push({ id: docId, driveFileId: fileRef.id, name: meta.name, status: "queued", department: folder, createdAt });
    } catch (error) {
      console.error(`[google-drive/import] Error processing ${fileRef.id}:`, error);
      const errorMessage = error instanceof DocumentError
        ? error.message
        : "Dokumen gagal diimpor karena kesalahan tak terduga di server.";
      try {
        await recordDocumentFailure({
          companyId,
          docId,
          name: displayName.replace(/[^\w.\- ]/g, "").trim() || "upload",
          department: folder,
          errorMessage,
        });
      } catch (insertError) {
        console.error(`[google-drive/import] Could not record failure for ${fileRef.id}:`, insertError);
      }
      results.push({ id: docId, driveFileId: fileRef.id, name: displayName, status: "failed", department: folder, errorMessage, createdAt });
    }
  }

  if (limitReached && results.length === 0) {
    return NextResponse.json({ error: limitMessage }, { status: 403 });
  }

  return NextResponse.json({
    documents: results,
    ...(limitReached ? { error: limitMessage } : {}),
  });
}
