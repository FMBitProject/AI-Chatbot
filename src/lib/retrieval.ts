import { and, cosineDistance, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks, documents } from "@/lib/db/schema";

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
export async function retrieveChunks(opts: {
  companyId: string;
  queryEmbedding: number[];
  department?: string | null;
  limit?: number;
  minScore?: number;
}): Promise<RetrievedChunk[]> {
  const { companyId, queryEmbedding, department = null, limit = 20, minScore = 0.5 } = opts;

  const distance = cosineDistance(documentChunks.embedding, queryEmbedding);

  const conditions = [
    eq(documentChunks.companyId, companyId),
    isNotNull(documentChunks.embedding),
  ];
  // Employees only see documents with no department (shared) or their own.
  if (department) {
    conditions.push(or(isNull(documents.department), eq(documents.department, department))!);
  }

  const rows = await db
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
