import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { consumeQuestionQuota, refundQuestionQuota, resolvePlanById } from "@/lib/subscription";
import { getLimits } from "@/lib/plan-limits";
import { hashApiKey } from "@/lib/api-key";
import { checkRateLimit, consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";
import { generateWithFallback, isRateLimitFailure } from "@/lib/models";
import { resolveByok } from "@/lib/byok";
import { GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "@/lib/rag-prompt";
import { canUseAiAnswers } from "@/lib/pricing";
import { withApiErrors } from "@/lib/api-error";
import { AiUnavailableError, AppError, type ErrorCode } from "@/lib/errors";

// Failed authentication attempts are limited by IP; valid callers have a
// separate workspace burst limit as well as plan question quotas.
const BAD_KEY_LIMIT = { max: 10, windowMs: 60 * 1000 };
const QUERY_LIMIT = { max: 20, windowMs: 60 * 1000 };

function failure(req: Request, status: number, code: ErrorCode, message: string, details?: unknown, retryAfter?: number) {
  const structured = req.headers.get("X-IntelliBase-Error-Format") === "structured";
  const legacyError = ["UNAUTHORIZED", "VALIDATION_ERROR", "RATE_LIMITED"].includes(code) ? message : code;
  const legacy = code === "QUOTA_EXCEEDED"
    ? { error: code, ...(details as { limit: number; period: string }) }
    : { error: legacyError, ...(legacyError === code ? { message } : {}) };
  return NextResponse.json(structured ? { error: { code, message, ...(details === undefined ? {} : { details }) } } : legacy, {
    status,
    headers: retryAfter === undefined ? undefined : { "Retry-After": String(retryAfter) },
  });
}

export const POST = withApiErrors("v1/query", async (req: Request) => {
  const authorization = req.headers.get("authorization");
  const key = authorization?.replace("Bearer ", "").trim();

  const badKeyBucket = `v1-bad-key:${getClientIp(req)}`;
  const badKeyStatus = await checkRateLimit(badKeyBucket, BAD_KEY_LIMIT);
  if (badKeyStatus.limited) {
    return failure(req, 429, "RATE_LIMITED", "Too many invalid API key attempts", undefined, badKeyStatus.retryAfter);
  }
  const [apiKey] = key ? await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(key))).limit(1) : [];
  if (!apiKey) {
    const attempt = await consumeRateLimit(badKeyBucket, BAD_KEY_LIMIT);
    if (!attempt.ok) return failure(req, 429, "RATE_LIMITED", "Too many invalid API key attempts", undefined, attempt.retryAfter);
    return failure(req, 401, "UNAUTHORIZED", key ? "Invalid API key" : "Missing API key");
  }

  const burst = await consumeRateLimit(`v1-query:${apiKey.companyId}`, QUERY_LIMIT);
  if (!burst.ok) return failure(req, 429, "RATE_LIMITED", "Too many requests", undefined, burst.retryAfter);

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));

  // Validated, not cast. This endpoint is reached by integrations we do not
  // control, so the body is the least trustworthy input in the app: a `question`
  // that arrives as a number reaches getEmbedding and throws on `.replace`,
  // answering a malformed request with a 500. An unbounded one is worse — it is
  // embedded and then generated on, while the quota below counts it as one
  // question however many tokens it actually cost.
  const body = await readJsonObject(req);
  if (!body) return failure(req, 400, "VALIDATION_ERROR", "Invalid JSON body");

  const question = optionalString(body.question, LIMITS.question);
  if (!question) {
    return failure(req, 400, "VALIDATION_ERROR", `question is required and must be a string of at most ${LIMITS.question} characters`, { field: "question" });
  }
  const language = body.language === "en" ? "en" : "id";

  // Same effective plan, grace period and quotas as the chat UI — an expired
  // subscription must not survive just because the caller uses the API.
  const { company, subscription } = await resolvePlanById(apiKey.companyId);

  // Same rule as the chat UI, and it has to be here or it is not a rule: an API
  // key is created by any admin regardless of plan, so without this a Starter
  // workspace could have every question answered by pointing a script at this
  // endpoint instead of opening the app. Checked before the quota for the same
  // reason as there — a refusal must not spend the question it refuses.
  if (!canUseAiAnswers(subscription.plan)) {
    return failure(req, 403, "AI_REQUIRES_PAID_PLAN", "Jawaban AI tersedia mulai paket berbayar. Paket gratis dapat memakai pencarian dokumen.");
  }

  // Before the quota is consumed, for the reason spelled out in /api/chat: an
  // unreadable key is a standing failure, not a passing one, so charging a
  // question for it would drain the caller's whole allowance into 500s.
  const byok = await resolveByok(company);
  if (!byok.ok) {
    console.error(`[v1/query] BYOK key unreadable for company ${apiKey.companyId}: ${byok.message}`);
    return failure(req, 503, "BYOK_KEY_UNREADABLE", byok.message);
  }

  // A caller on its own provider keys has no question caps to enforce here (see
  // getLimits); the document and seat limits are unchanged either way.
  const limits = getLimits(subscription.plan, byok.ownOnly);

  const quotaFailure = await consumeQuestionQuota(apiKey.companyId, limits);
  if (quotaFailure) {
    const now = new Date();
    const reset = quotaFailure.period === "daily"
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    return failure(req, 429, "QUOTA_EXCEEDED", "Question quota exceeded", quotaFailure,
      Math.max(1, Math.ceil((reset - now.getTime()) / 1000)));
  }

  // The three steps that can fail after the question has been paid for, and the
  // catch below gives it back for all of them.
  //
  // The charge has to happen first — that is what makes the limit atomic and
  // stops concurrent callers overshooting it — so every failure here is one the
  // customer paid for and did not cause. Without the refund, an afternoon of
  // Groq 429s silently eats a Starter workspace's monthly allowance and nothing
  // in the product ever explains where the questions went.
  //
  // `stage` is what lets the catch say which of the three actually failed. It is
  // not bookkeeping: without it a Postgres outage during retrieval was reported
  // to the integration as AI_ERROR, which is the "wrong status page" mistake the
  // note further down congratulates itself on avoiding.
  let stage: "embedding" | "retrieval" | "generation" = "embedding";
  let answer: { text: string; model: { id: string } };
  let scored: { id: string; text: string }[];

  try {
    const queryEmbedding = await getEmbedding(question, byok.gemini);

    stage = "retrieval";
    scored = (await withTenant(apiKey.companyId, (tx) => retrieveChunks({
      companyId: apiKey.companyId,
      queryEmbedding,
      access: { role: "admin" },
      maxDocuments: limits.maxDocuments,
    }, tx))).slice(0, 4);

    const context = scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
    const langRule = language === "en" ? "Respond in English." : "Jawab dalam Bahasa Indonesia.";

    // Down the shared chain rather than one hardcoded model. This endpoint is
    // called by scripts and integrations, which retry badly or not at all, so a
    // one-minute Groq refusal used to surface as a 500 in someone else's system.
    stage = "generation";
    answer = await generateWithFallback({
      label: "v1/query",
      keys: byok,
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

  } catch (error) {
    // Refunded first, and it never throws, so it cannot displace the real error.
    await refundQuestionQuota(apiKey.companyId, limits, "v1/query");

    // A coded response, not the bare 500 this used to be. The route had no
    // try/catch at all, so any of the three awaits above reached Next's default
    // handler and answered with a non-JSON body — which an integration calling
    // res.json() turns into a SyntaxError on its side, blaming its own parser
    // for our outage.
    //
    // Our database is not an AI provider. Telling an integration that the AI
    // service is down when Postgres is unreachable sends whoever reads that log
    // to Groq's status page over our own outage.
    if (stage === "retrieval") {
      throw new AppError("Document retrieval failed", "INTERNAL_ERROR", 500, { cause: error, lang: language });
    }

    // Named for the embedding step because there is only one provider it can be;
    // left unnamed for generation because generateWithFallback rethrows the last
    // error unchanged without saying which link in the chain raised it, and
    // guessing is how an admin ends up reading the wrong status page.
    throw new AiUnavailableError(
      isRateLimitFailure(error),
      stage === "embedding" ? "gemini" : undefined,
      // The language the caller asked for in the request body. Without it an
      // integration that sent {"language":"en"} was refused in Indonesian.
      { cause: error, lang: language },
    );
  }

  // Outside the try on purpose: serialising the response is not one of the three
  // steps the catch above refunds for, and a failure here would otherwise hand
  // back a question that was answered.
  return NextResponse.json({
    answer: answer.text,
    sources: scored.map((c) => ({ id: c.id, excerpt: c.text.slice(0, 200) })),
    // The model that actually answered, not the one at the top of the chain.
    // This field was a hardcoded string; with a fallback behind it that would
    // have become a lie told to an integration that has no other way to know
    // which model wrote the answer it is about to store.
    model: answer.model.id,
  });
});
