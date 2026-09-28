import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { advancePrivacy, lockPrivacyMutation } from "@/lib/privacy";
import { classificationInput } from "@/lib/privacy-policy";
import { companies, documentChunks, documentIndexChunks, documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";
import { withApiErrors } from "@/lib/api-error";

/**
 * Folder changes preserve the index. Classification changes clear derived
 * content and revoke earlier AI context, including legacy conversation history.
 * Raw document text is never writable through this endpoint.
 */
export const PATCH = withApiErrors("admin/documents/classification", async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const { id } = await params;
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  if ("classification" in body && Object.keys(body).some(key => key !== "classification")) {
    return NextResponse.json({ error: "Ubah klasifikasi secara terpisah dari pengaturan lain." }, { status: 400 });
  }
  if ("classification" in body) {
    const classification = classificationInput(body.classification);
    if (!classification || body.classification == null) return NextResponse.json({ error: "Klasifikasi tidak valid." }, { status: 400 });
    const updated = await withTenant(companyId, async tx => {
      await lockPrivacyMutation(tx, companyId);
      await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("update");
      const [doc] = await tx.select().from(documents).where(and(eq(documents.id, id), eq(documents.companyId, companyId))).for("update");
      if (!doc) return null;
      const view = (row: typeof doc) => ({ id: row.id, classification: row.classification, status: row.status, summary: row.summary, errorMessage: row.errorMessage });
      if (doc.classification === classification) return { document: view(doc) };
      const changesExposure = doc.classification === "confidential" || classification === "confidential";
      if (changesExposure && !doc.rawText?.trim()) return { conflict: true };
      if (!changesExposure) {
        const [saved] = await tx.update(documents).set({ classification }).where(eq(documents.id, id)).returning();
        await advancePrivacy(tx, companyId, "classification_changed", [id]);
        return { document: view(saved) };
      }
      await tx.delete(documentChunks).where(eq(documentChunks.documentId, id));
      await tx.delete(documentIndexChunks).where(eq(documentIndexChunks.documentId, id));
      const [saved] = await tx.update(documents).set({ classification, summary: null, indexingStartedAt: null,
        status: classification === "confidential" ? "blocked" : "queued",
        errorMessage: classification === "confidential" ? "Dokumen rahasia disimpan tanpa dikirim ke AI eksternal." : null,
      }).where(eq(documents.id, id)).returning();
      await advancePrivacy(tx, companyId, "classification_changed", [id]);
      return { document: view(saved) };
    }, { signal: req.signal, timeoutMs: 20_000 });
    if (!updated) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    if ("conflict" in updated) return NextResponse.json({ error: "Teks sumber tidak tersedia. Unggah kembali dokumen sebelum mengubah klasifikasi rahasia." }, { status: 409 });
    return NextResponse.json(updated.document);
  }
  if (!("folder" in body)) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const raw = body.folder;

  // Two outcomes, and they were conflated before: "the caller asked to unfile
  // this document" and "the caller sent something we cannot store".
  //
  // Blank is unfiling. `null` is what the UI sends, and a string that is empty
  // once trimmed means the same thing — a person who typed spaces into a folder
  // name has not named a folder. That case used to fall through to
  // optionalString, which trims, finds nothing left, and returns null exactly
  // like a 300-character name does; the request was then rejected as "maksimal
  // 100 karakter" for an input of three spaces. Wrong branch, and an error
  // message that sends the reader looking for a length problem that is not
  // there.
  const isBlank = raw === null || (typeof raw === "string" && raw.trim().length === 0);
  const folder = isBlank ? null : optionalString(raw, LIMITS.name);

  // Reached only when something was sent and it was not usable: not a string,
  // or longer than the cap. The message names both, because the caller here is
  // a script or a stale client — the UI cannot produce either.
  if (!isBlank && folder === null) {
    return NextResponse.json(
      { error: `Nama folder harus berupa teks, maksimal ${LIMITS.name} karakter.` },
      { status: 400 },
    );
  }

  // Tenant-scoped like the delete below, with the companyId predicate kept as
  // defence-in-depth on top of the RLS policy. `returning` is what tells a
  // request for somebody else's document id apart from a successful move — RLS
  // makes both update zero rows, and answering "ok" to the first would be a
  // quiet lie.
  const [updated] = await withTenant(companyId, (tx) =>
    tx.update(documents)
      .set({ department: folder })
      .where(and(eq(documents.id, id), eq(documents.companyId, companyId)))
      .returning({ id: documents.id, department: documents.department }));

  if (!updated) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });

  return NextResponse.json(updated);
});

export const DELETE = withApiErrors("admin/documents/delete", async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const { id } = await params;
  // documents is RLS-protected; the delete runs in a tenant-scoped transaction.
  // The explicit companyId predicate is defence-in-depth on top of the policy.
  // document_chunks cascade-deletes via its FK (RI actions bypass RLS).
  const deleted = await withTenant(companyId, async tx => {
    await lockPrivacyMutation(tx, companyId);
    await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("update");
    const rows = await tx.delete(documents).where(and(eq(documents.id, id), eq(documents.companyId, companyId))).returning({ id: documents.id });
    if (!rows.length) return false;
    await advancePrivacy(tx, companyId, "document_deleted", [id]);
    return true;
  }, { signal: req.signal, timeoutMs: 20_000 });
  if (!deleted) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ ok: true, historyExcludedFromAi: true, providerDeletion: "not_requested" });
});
