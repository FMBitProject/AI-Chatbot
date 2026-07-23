import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys, companies, chatMessages, chatSessions } from "@/lib/db/schema";
import { eq, count, and, gte, sql, isNull, or, lt } from "drizzle-orm";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { withTenant } from "@/lib/db/tenant";
import { getLimits } from "@/lib/plan-limits";
import { hashApiKey } from "@/lib/api-key";
import { isRateLimited, recordFailure, getClientIp } from "@/lib/rate-limit";
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

  const { question, language = "id" } = await req.json() as { question: string; language?: string };
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  // Enforce same daily/monthly quota as the chat UI
  let [company] = await db.select().from(companies).where(eq(companies.id, apiKey.companyId)).limit(1);

  // Lazy expiry: downgrade plan if subscription has expired
  if (company?.planExpiresAt && company.planExpiresAt < new Date() && company.plan !== "starter") {
    await db.update(companies)
      .set({ plan: "starter", planExpiresAt: null })
      .where(eq(companies.id, apiKey.companyId));
    company = { ...company, plan: "starter", planExpiresAt: null };
  }

  const { maxQuestionsPerDay, maxQuestionsPerMonth } = getLimits(company?.plan ?? "starter");
  const today = new Date().toISOString().split("T")[0];

  if (maxQuestionsPerDay !== -1) {
    const updated = await db.update(companies)
      .set({
        dailyQuestionCount: sql`CASE WHEN daily_question_date = ${today} THEN daily_question_count + 1 ELSE 1 END`,
        dailyQuestionDate: today,
      })
      .where(and(
        eq(companies.id, apiKey.companyId),
        or(isNull(companies.dailyQuestionDate), sql`daily_question_date != ${today}`, lt(companies.dailyQuestionCount, maxQuestionsPerDay))
      ))
      .returning({ id: companies.id });

    if (updated.length === 0) {
      return NextResponse.json({ error: "QUOTA_EXCEEDED", limit: maxQuestionsPerDay, period: "daily" }, { status: 429 });
    }
  }

  if (maxQuestionsPerMonth !== -1) {
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const [{ total: monthlyCount }] = await db
      .select({ total: count() }).from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(eq(chatSessions.companyId, apiKey.companyId), eq(chatMessages.role, "user"), gte(chatMessages.createdAt, startOfMonth)));
    if (monthlyCount >= maxQuestionsPerMonth) {
      return NextResponse.json({ error: "QUOTA_EXCEEDED", limit: maxQuestionsPerMonth, period: "monthly" }, { status: 429 });
    }
  }

  const groqClient = company?.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;
  const queryEmbedding = await getEmbedding(question, company?.geminiApiKey);
  const scored = (await withTenant(apiKey.companyId, (tx) => retrieveChunks({
    companyId: apiKey.companyId,
    queryEmbedding,
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
