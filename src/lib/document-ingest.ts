// Shared between the manual upload route and the Google Drive import route —
// both need the exact same document-cap enforcement, and duplicating it is
// exactly the kind of thing that drifts out of sync later (see the comment on
// `queueDocument` below for why this has to be one transaction).
import { withTenant } from "@/lib/db/tenant";
// Aliased: `companies` is also the name of the plan-limits concept elsewhere
// in this codebase, and an unqualified import here reads like the plan rather
// than the table it locks.
import { companies as companiesTable, documents } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { isUnderLimit } from "@/lib/plan-limits";
import { LIMITS, optionalString } from "@/lib/validate";

// Shared by the upload route (multipart field) and the Drive import route
// (JSON field) — both accept the same "which folder does this batch go
// into" input and must refuse the same way when it's unusable. Refused
// rather than silently dropped: see the comment on the callers for why a
// too-long folder name is worth stopping the whole request over.
export function resolveFolderParam(raw: unknown): { folder: string | null } | { error: string } {
  const omitted = raw === null || raw === undefined || raw === "";
  if (omitted) return { folder: null };
  const folder = optionalString(raw, LIMITS.name);
  if (folder === null) {
    return { error: `Nama folder harus berupa teks, maksimal ${LIMITS.name} karakter.` };
  }
  return { folder };
}

/**
 * Counts and inserts inside one transaction, behind a lock on the company
 * row, because a cap enforced by "count, then insert" is not enforced at
 * all. Two concurrent imports both read 49 of 50, both insert, and the
 * company owns 51 documents on a plan that sells 50. Nothing about it looks
 * like a bug afterwards: no error, no log, just a number that should have
 * been impossible.
 *
 * The lock is taken on `companies` rather than on the document rows because
 * there is no row to lock for a document that does not exist yet; what needs
 * serialising is the decision, and the tenant is what the decision is about.
 *
 * Returns false (nothing written) when the cap is already hit.
 */
export async function queueDocument(params: {
  companyId: string;
  maxDocuments: number;
  docId: string;
  name: string;
  department: string | null;
  rawText: string;
}): Promise<boolean> {
  const { companyId, maxDocuments, docId, name, department, rawText } = params;
  return withTenant(companyId, async (tx) => {
    await tx.select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .for("update");

    const [{ count: current }] = await tx.select({ count: count() })
      .from(documents)
      .where(eq(documents.companyId, companyId));
    if (!isUnderLimit(current, maxDocuments)) return false;

    await tx.insert(documents).values({
      id: docId,
      name,
      companyId,
      department,
      status: "queued",
      rawText,
    });
    return true;
  });
}

// No cap check here on purpose — a failed document never counted against the
// company's quota, so recording it can never push a company over the limit
// the way a successful insert could. No lock needed either.
export async function recordDocumentFailure(params: {
  companyId: string;
  docId: string;
  name: string;
  department: string | null;
  errorMessage: string;
}): Promise<void> {
  const { companyId, docId, name, department, errorMessage } = params;
  await withTenant(companyId, (tx) => tx.insert(documents).values({
    id: docId,
    name,
    companyId,
    department,
    status: "failed",
    errorMessage,
  }));
}
