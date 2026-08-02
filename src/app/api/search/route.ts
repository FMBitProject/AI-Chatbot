import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = dbUser.companyId;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  // Search returns raw document text, so it has to respect the same plan rules
  // as chat: a frozen seat gets nothing, and documents frozen by the plan's
  // document limit stay out of the results. No question quota here — search
  // asks the AI nothing, it only embeds the query.
  const { company, limits } = await resolvePlanById(companyId);
  if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
    return NextResponse.json({ error: "SEAT_FROZEN", message: SEAT_FROZEN_MESSAGE }, { status: 403 });
  }

  // Same shape of failure as chat, so it gets the same shape of answer: an
  // unwrapped throw here became a bare 500 with nothing the UI could show,
  // while /api/chat has always returned a typed reason for the identical call.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(q, company?.geminiApiKey);
  } catch (err) {
    console.error("[search] Embedding failed:", err);
    const is429 = err instanceof Error && err.message.includes("429");
    return NextResponse.json(
      { error: is429 ? "AI_RATE_LIMIT" : "AI_ERROR", provider: "gemini" },
      { status: 503 },
    );
  }

  // Search is permissive (minScore 0) so it still surfaces weaker matches; it's
  // department-scoped like chat so employees only see documents they may access.
  const results = (await withTenant(companyId, (tx) => retrieveChunks({
    companyId,
    queryEmbedding,
    department: dbUser.department,
    limit: 8,
    minScore: 0,
    maxDocuments: limits.maxDocuments,
  }, tx))).map((c) => ({
    id: c.id,
    text: c.text,
    documentName: c.documentName,
    documentId: c.documentId,
    score: c.score,
  }));

  return NextResponse.json(results);
}
