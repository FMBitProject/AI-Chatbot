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
import { generateText } from "ai";
import { groq, createGroq } from "@ai-sdk/groq";

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
  const { company, limits } = await resolvePlanById(apiKey.companyId);

  const quotaFailure = await consumeQuestionQuota(apiKey.companyId, limits);
  if (quotaFailure) {
    return NextResponse.json(
      { error: "QUOTA_EXCEEDED", limit: quotaFailure.limit, period: quotaFailure.period },
      { status: 429 }
    );
  }

  const groqClient = company?.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;
  const queryEmbedding = await getEmbedding(question, company?.geminiApiKey);
  const scored = (await withTenant(apiKey.companyId, (tx) => retrieveChunks({
    companyId: apiKey.companyId,
    queryEmbedding,
    maxDocuments: limits.maxDocuments,
  }, tx))).slice(0, 4);

  const context = scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
  const langRule = language === "en" ? "Respond in English." : "Jawab dalam Bahasa Indonesia.";

  const { text } = await generateText({
    model: groqClient("llama-3.3-70b-versatile"),
    system: `You are ${company?.aiName ?? "IntelliBase AI"}, an internal company AI assistant. Answer ONLY based on the provided document context. ${langRule} If not found, say so clearly.`,
    prompt: `Context:\n${context}\n\nQuestion: ${question}`,
  });

  return NextResponse.json({
    answer: text,
    sources: scored.map((c) => ({ id: c.id, excerpt: c.text.slice(0, 200) })),
    model: "llama-3.3-70b-versatile",
  });
}
