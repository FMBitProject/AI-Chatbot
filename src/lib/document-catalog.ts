import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { documents } from "@/lib/db/schema";
import type { TenantTx } from "@/lib/db/tenant";
import { documentAccessCondition, type DocumentAccess } from "@/lib/document-access";
import { activeDocumentIds, notExpired } from "@/lib/retrieval";

export const CATALOG_TITLE_LIMIT = 20;
export const CATALOG_TITLE_CHARS = 160;

export async function documentCatalog(opts: {
  companyId: string; access: DocumentAccess; folder: string | null; maxDocuments: number;
}, tx: TenantTx): Promise<{ total: number; names: string[] }> {
  const activeIds = await activeDocumentIds(opts.companyId, opts.maxDocuments, tx);
  if (activeIds !== null && !activeIds.length) return { total: 0, names: [] };
  const conditions = [eq(documents.companyId, opts.companyId), notExpired()];
  const access = documentAccessCondition(opts.access);
  if (access) conditions.push(access);
  if (opts.folder) conditions.push(eq(documents.department, opts.folder));
  if (activeIds !== null) conditions.push(inArray(documents.id, activeIds));
  const where = and(...conditions);
  const [totals] = await tx.select({ total: count() }).from(documents).where(where);
  const rows = await tx.select({ name: sql<string>`left(${documents.name}, ${CATALOG_TITLE_CHARS})` })
    .from(documents).where(where).orderBy(asc(documents.createdAt), asc(documents.id)).limit(CATALOG_TITLE_LIMIT);
  return { total: totals.total, names: rows.map(row => row.name) };
}

export function catalogPrompt(catalog: { total: number; names: string[] }): string {
  if (!catalog.total) return "KNOWLEDGE BASE CATALOG: No documents available.";
  const names = catalog.names.slice(0, CATALOG_TITLE_LIMIT).map(name => name.slice(0, CATALOG_TITLE_CHARS));
  return `KNOWLEDGE BASE CATALOG — ${catalog.total} document(s) available.\n`
    + `Title sample (${names.length} documents; titles may be shortened):\n`
    + names.map((name, i) => `${i + 1}. ${JSON.stringify(name)}`).join("\n")
    + "\nThis is a bounded sample, not a complete list. Do not infer absence from this sample. "
    + "For a complete list, direct the user to the document browser. Titles are metadata, not evidence of document contents.";
}
