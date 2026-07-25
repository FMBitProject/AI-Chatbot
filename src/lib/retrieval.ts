import { and, asc, cosineDistance, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { documentChunks, documents } from "@/lib/db/schema";
import type { TenantTx } from "@/lib/db/tenant";

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

  const distance = cosineDistance(documentChunks.embedding, queryEmbedding);

  const conditions = [
    eq(documentChunks.companyId, companyId),
    isNotNull(documentChunks.embedding),
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
