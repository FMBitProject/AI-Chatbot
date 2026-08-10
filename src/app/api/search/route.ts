import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { isSeatActive, resolvePlanById, SEAT_FROZEN_MESSAGE } from "@/lib/subscription";
import { LIMITS } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const dbUser = guard.user;
  const { companyId } = dbUser;

  // An empty query is not an error, it is just nothing to search for — the
  // search box sends one on every clear. An over-long one is a different thing
  // and gets a different answer: every query here costs a Gemini embedding call,
  // and unlike chat this route has no question quota in front of it (see the
  // note below), so its length is the only thing bounding what a single caller
  // can spend.
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  if (q.length > LIMITS.question) {
    return NextResponse.json(
      { error: "QUERY_TOO_LONG", limit: LIMITS.question },
      { status: 400 },
    );
  }

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
