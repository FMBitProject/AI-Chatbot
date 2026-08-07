import { and, asc, cosineDistance, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { documentChunks, documents } from "@/lib/db/schema";
import type { TenantTx } from "@/lib/db/tenant";

// A document past its expiry date is not an answerable document.
//
// `documents.expires_at` has been in the schema and on the admin document list
// since the beginning, and nothing has ever consulted it: an expired SOP kept
// being retrieved, cited and answered from exactly like a current one. Nothing
// writes the column yet either, so today every row has NULL here and this
// changes no result — which is the point of adding it now rather than later. If
// the UI to set an expiry ships first, the gap stops being a dormant one and
// becomes a compliance promise the retriever quietly breaks, in a product sold
// to hospitals and clinics whose whole reason for setting a date is that the
// old version must stop being quoted.
//
// NULL means "no expiry", so it has to be admitted explicitly — `expires_at >
// now()` on its own is NULL for those rows, and a NULL predicate filters them
// out, which would hide every document in the database.
export function notExpired(now: Date = new Date()) {
  return or(isNull(documents.expiresAt), gt(documents.expiresAt, now))!;
}

// Documents above the plan's document limit are frozen rather than deleted: the
// ones uploaded first stay searchable and the rest come back untouched when the
// company subscribes again. Without this a company could upload 100 documents
// on one paid month and keep querying all of them forever on the free plan.
//
// Returns null when the plan is unlimited (-1), meaning "no filter needed".
export async function activeDocumentIds(
  companyId: string,
  maxDocuments: number,
  tx: TenantTx,
): Promise<string[] | null> {
  if (maxDocuments === -1) return null;

  const rows = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.companyId, companyId))
    // id breaks ties so the frozen set stays stable between queries.
    .orderBy(asc(documents.createdAt), asc(documents.id))
    .limit(maxDocuments);

  return rows.map((r) => r.id);
}

// How wide the HNSW index searches before Postgres applies our filters.
//
// The index answers a query from a candidate list of `hnsw.ef_search` vectors,
// default 40 — and every filter in the query is applied to those candidates
// *after* the index produced them. With a handful of documents that is
// invisible. At the document counts a paid plan allows (Professional 100,
// Enterprise 500 — tens of thousands of chunks) it stops being invisible:
//   - chat asks for the 30 nearest chunks out of a candidate list of 40, which
//     leaves almost no room for anything to be filtered out;
//   - an employee in a department only sees documents tagged for it or shared,
//     so a department holding 10% of the corpus can lose most of its 40;
//   - an expired or over-limit plan filters to the first N documents on top.
// Each of those turns "the answer is in a document you own" into "informasi
// tidak ditemukan", and the bigger the customer, the more likely it is.
//
// So the candidate list is sized from what the caller actually asked for, with a
// floor well above it, and a ceiling because ef_search is what this query costs.
function efSearchFor(limit: number): number {
  return Math.min(400, Math.max(100, limit * 4));
}

// Widen the search, and let it keep going when filters eat the candidates.
//
// `hnsw.iterative_scan` (pgvector 0.8+) is the part that matters for the
// filtered cases above: without it the scan gives back whatever survived the
// filter, even if that is three rows out of a requested thirty; with it, the
// index is asked for more until the limit is met or the index is exhausted.
// `strict_order` keeps results in true distance order, so callers can trust the
// ranking and the scores they show as citations.
//
// Set per transaction (`set_config(..., true)`), so nothing leaks into another
// request that reuses the pooled connection.
// One statement, not two: this runs on the critical path of every question
// asked, through chat, Slack and the public API alike, and a second round trip
// to Neon buys nothing.
async function tuneVectorSearch(tx: TenantTx, limit: number): Promise<void> {
  await tx.execute(sql`
    select
      set_config('hnsw.ef_search', ${String(efSearchFor(limit))}, true),
      set_config('hnsw.iterative_scan', 'strict_order', true)
  `);
}

export interface RetrievedChunk {
  id: string;
  text: string;
  documentId: string;
  documentName: string;
  department: string | null;
  score: number; // cosine similarity in [-1, 1]; higher is more relevant
}

// Shared vector retrieval used by chat, the public API, and Slack so all three
// channels rank and threshold identically. Uses the pgvector HNSW index via
// drizzle's cosineDistance operator (`embedding <=> query`), so ordering +
// LIMIT are done in the database instead of scanning every chunk in JS.
//
// documents/document_chunks are RLS-protected, so this MUST run inside a
// withTenant(companyId, ...) transaction — the caller passes that transaction's
// `tx` handle. The explicit companyId filter below is kept as defence-in-depth
// on top of the row-level policy.
export async function retrieveChunks(opts: {
  companyId: string;
  queryEmbedding: number[];
  department?: string | null;
  limit?: number;
  minScore?: number;
  // Document limit of the plan that applies right now (-1 = unlimited). Callers
  // must pass the *effective* plan's limit (see resolvePlan) so an expired
  // subscription cannot keep querying documents it can no longer hold.
  maxDocuments?: number;
}, tx: TenantTx): Promise<RetrievedChunk[]> {
  const { companyId, queryEmbedding, department = null, limit = 20, minScore = 0.5, maxDocuments = -1 } = opts;

  const activeIds = await activeDocumentIds(companyId, maxDocuments, tx);
  if (activeIds !== null && activeIds.length === 0) return [];

  await tuneVectorSearch(tx, limit);

  const distance = cosineDistance(documentChunks.embedding, queryEmbedding);

  const conditions = [
    eq(documentChunks.companyId, companyId),
    isNotNull(documentChunks.embedding),
    notExpired(),
  ];
  if (activeIds !== null) {
    conditions.push(inArray(documentChunks.documentId, activeIds));
  }
  // Employees only see documents with no department (shared) or their own.
  if (department) {
    conditions.push(or(isNull(documents.department), eq(documents.department, department))!);
  }

  const rows = await tx
    .select({
      id: documentChunks.id,
      text: documentChunks.text,
      documentId: documentChunks.documentId,
      documentName: documents.name,
      department: documents.department,
      score: sql<number>`1 - (${distance})`,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .where(and(...conditions))
    .orderBy(distance)
    .limit(limit);

  return rows
    .map((r) => ({ ...r, score: Number(r.score) }))
    .filter((r) => r.score > minScore);
}
