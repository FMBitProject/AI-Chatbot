import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";

/**
 * Moves one document into a folder, or out of every folder.
 *
 * Only `documents.department` is writable here, and deliberately so: this
 * endpoint exists because a document filed in the wrong place is the most
 * ordinary mistake there is, and re-uploading a 40-page PDF to fix a label is
 * not a repair. Everything else on the row is either derived (status,
 * errorMessage, summary) or the document itself (rawText).
 *
 * Nothing needs re-indexing afterwards. The folder lives on the document, and
 * the retriever joins to it — the chunks and their embeddings are untouched, so
 * the move takes effect on the next question.
 *
 * Three inputs, three meanings: a string files it, `null` unfiles it, and an
 * absent field is a request with nothing in it (400) rather than a silent
 * no-op — the same distinction /api/admin/company draws for the BYOK keys.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const { id } = await params;
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

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
}

export async function DELETE(
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
  await withTenant(companyId, (tx) =>
    tx.delete(documents).where(and(eq(documents.id, id), eq(documents.companyId, companyId))));

  return NextResponse.json({ ok: true });
}
