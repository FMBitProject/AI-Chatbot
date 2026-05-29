import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentChunks, users, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const queryEmbedding = await getEmbedding(q);

  const chunks = await db
    .select({
      id: documentChunks.id,
      text: documentChunks.text,
      embeddingJson: documentChunks.embeddingJson,
      documentId: documentChunks.documentId,
      documentName: documents.name,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documentChunks.companyId, dbUser.companyId));

  const results = chunks
    .filter((c) => c.embeddingJson)
    .map((c) => ({
      id: c.id,
      text: c.text,
      documentName: c.documentName,
      documentId: c.documentId,
      score: cosineSimilarity(queryEmbedding, JSON.parse(c.embeddingJson!) as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return NextResponse.json(results);
}
