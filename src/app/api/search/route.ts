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
  const { limits } = await resolvePlanById(companyId);
  if (!(await isSeatActive({ ...dbUser, companyId }, limits.maxEmployees))) {
    return NextResponse.json({ error: "SEAT_FROZEN", message: SEAT_FROZEN_MESSAGE }, { status: 403 });
  }

  const queryEmbedding = await getEmbedding(q);

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
