import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { consumeQuestionQuota, resolvePlanById } from "@/lib/subscription";
import { hashApiKey } from "@/lib/api-key";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";
import { generateWithFallback } from "@/lib/models";
import { resolveByok } from "@/lib/byok";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { canUseAiAnswers } from "@/lib/pricing";

// Only failed key lookups count toward this, so valid integrations are never
// throttled here (they are governed by the plan quotas below instead).
const BAD_KEY_LIMIT = { max: 10, windowMs: 60 * 1000 };

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const key = authorization?.replace("Bearer ", "").trim();

  const badKeyBucket = `v1-bad-key:${getClientIp(req)}`;
  if (isRateLimited(badKeyBucket, BAD_KEY_LIMIT)) {
    return NextResponse.json({ error: "Too many invalid API key attempts" }, { status: 429 });
  }

  if (!key) return NextResponse.json({ error: "Missing API key" }, { status: 401 });

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(key))).limit(1);
  if (!apiKey) {
    recordFailure(badKeyBucket, BAD_KEY_LIMIT);
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));

  // Validated, not cast. This endpoint is reached by integrations we do not
  // control, so the body is the least trustworthy input in the app: a `question`
  // that arrives as a number reaches getEmbedding and throws on `.replace`,
  // answering a malformed request with a 500. An unbounded one is worse — it is
  // embedded and then generated on, while the quota below counts it as one
  // question however many tokens it actually cost.
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const question = optionalString(body.question, LIMITS.question);
  if (!question) {
    return NextResponse.json(
      { error: `question is required and must be a string of at most ${LIMITS.question} characters` },
      { status: 400 },
    );
  }
  const language = body.language === "en" ? "en" : "id";

  // Same effective plan, grace period and quotas as the chat UI — an expired
  // subscription must not survive just because the caller uses the API.
  const { company, subscription, limits } = await resolvePlanById(apiKey.companyId);

  // Same rule as the chat UI, and it has to be here or it is not a rule: an API
  // key is created by any admin regardless of plan, so without this a Starter
  // workspace could have every question answered by pointing a script at this
  // endpoint instead of opening the app. Checked before the quota for the same
  // reason as there — a refusal must not spend the question it refuses.
  if (!canUseAiAnswers(subscription.plan)) {
    return NextResponse.json(
      {
        error: "AI_REQUIRES_PAID_PLAN",
        message: "Jawaban AI tersedia mulai paket berbayar. Paket gratis dapat memakai pencarian dokumen.",
      },
      { status: 403 },
    );
  }

  // Before the quota is consumed, for the reason spelled out in /api/chat: an
  // unreadable key is a standing failure, not a passing one, so charging a
  // question for it would drain the caller's whole allowance into 500s.
  const byok = resolveByok(company);
  if (!byok.ok) {
    console.error(`[v1/query] BYOK key unreadable for company ${apiKey.companyId}: ${byok.message}`);
    return NextResponse.json({ error: "BYOK_KEY_UNREADABLE", message: byok.message }, { status: 503 });
  }

  const quotaFailure = await consumeQuestionQuota(apiKey.companyId, limits);
  if (quotaFailure) {
    return NextResponse.json(
      { error: "QUOTA_EXCEEDED", limit: quotaFailure.limit, period: quotaFailure.period },
      { status: 429 }
    );
  }

  const queryEmbedding = await getEmbedding(question, byok.gemini);
  const scored = (await withTenant(apiKey.companyId, (tx) => retrieveChunks({
    companyId: apiKey.companyId,
    queryEmbedding,
    maxDocuments: limits.maxDocuments,
  }, tx))).slice(0, 4);

  const context = scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
  const langRule = language === "en" ? "Respond in English." : "Jawab dalam Bahasa Indonesia.";

  // Down the shared chain rather than one hardcoded model. This endpoint is
  // called by scripts and integrations, which retry badly or not at all, so a
  // one-minute Groq refusal used to surface as a 500 in someone else's system.
  const { text, model } = await generateWithFallback({
    label: "v1/query",
    keys: { groq: byok.groq, gemini: byok.gemini },
    // The grounding rule here used to be one sentence: "Answer ONLY based on
    // the provided document context… If not found, say so clearly." Not wrong,
    // just not enough — a model obeys it, reports the gap, and keeps writing.
    // This channel answers machines rather than people, which makes an invented
    // figure worse, not better: it arrives as JSON in someone else's system with
    // a `sources` array beside it, and nothing downstream can tell which
    // sentence came from a document.
    system: `You are ${company?.aiName ?? "IntelliBase AI"}, an internal company AI assistant.\n\n${GROUNDING_RULES}\n\n${langRule}\n\n${GROUNDING_REMINDER}`,
    prompt: `Context:\n${context}\n\nQuestion: ${question}`,
    temperature: RAG_TEMPERATURE,
  });

  return NextResponse.json({
    answer: text,
    sources: scored.map((c) => ({ id: c.id, excerpt: c.text.slice(0, 200) })),
    // The model that actually answered, not the one at the top of the chain.
    // This field was a hardcoded string; with a fallback behind it that would
    // have become a lie told to an integration that has no other way to know
    // which model wrote the answer it is about to store.
    model: model.id,
  });
}
