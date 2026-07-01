import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const queryEmbedding = await getEmbedding(q);

  // Search is permissive (minScore 0) so it still surfaces weaker matches; it's
  // department-scoped like chat so employees only see documents they may access.
  const results = (await retrieveChunks({
    companyId: dbUser.companyId,
    queryEmbedding,
    department: dbUser.department,
    limit: 8,
    minScore: 0,
  })).map((c) => ({
    id: c.id,
    text: c.text,
    documentName: c.documentName,
    documentId: c.documentId,
    score: c.score,
  }));

  return NextResponse.json(results);
}
