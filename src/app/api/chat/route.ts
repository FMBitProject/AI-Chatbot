import { NextRequest } from "next/server";
import { streamText, generateText } from "ai";
import { groq, createGroq } from "@ai-sdk/groq";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentChunks, users, chatSessions, chatMessages, documents, companies } from "@/lib/db/schema";
import { eq, count, and, gte, sql, isNull, or, lt } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { getLimits } from "@/lib/plan-limits";
import { randomUUID } from "crypto";

function detectLang(text: string): "id" | "en" {
  const idPattern = /\b(apa|bagaimana|jelaskan|saya|yang|adalah|dan|dengan|untuk|ini|itu|tidak|bisa|cara|tolong|mohon|sebutkan|berikan|apakah|mengapa|kapan|siapa|dimana|berapa|boleh|perlu|harus|bisa|ingin|mau)\b/i;
  return idPattern.test(text) ? "id" : "en";
}

const SYSTEM_PROMPT = `You are an internal AI assistant for a company, helping employees find accurate information from official internal documents such as SOPs, HR regulations, and IT guidelines.

MANDATORY RULES:
1. Answer ONLY based on the document context provided below. Do not add information from outside the context.
2. If the answer cannot be validated from the provided context, use the exact "not found" message specified in the LANGUAGE RULE below.
3. Never fabricate, guess, or extrapolate answers beyond what is explicitly stated in the context.
4. TERMINOLOGY: Always use the EXACT technical terms, abbreviations, and proper nouns as they appear in the source documents. Do NOT translate domain-specific or technical terms (e.g., if the document uses "Fair Market Value", "honorarium", "HCP Engagement", use those exact terms — do not substitute with informal translations).
5. SPELLING & GRAMMAR: Use correct, professional spelling and grammar at all times. For Indonesian responses, strictly follow PUEBI (Pedoman Umum Ejaan Bahasa Indonesia). Common errors to avoid: "menspesifikasikan" NOT "menspecifikasikan", "persentase" NOT "prosentase", "jadwal" NOT "jadual".
6. TONE: Maintain a formal, professional tone appropriate for a corporate internal knowledge base.
7. FORMAT: Use clear formatting — bold for key terms/headings, bullet points for steps or lists, numbered lists for sequential procedures.
8. DOCUMENT CATALOG: The KNOWLEDGE BASE CATALOG section lists ALL documents available in this knowledge base. Use it to answer any questions about document count, names, or availability — even if a document's full content is not in the retrieved excerpts below.`;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) {
    return new Response(JSON.stringify({ error: "User tidak ditemukan." }), { status: 403 });
  }

  const { messages, sessionId, responseLang } = await req.json() as {
    messages: { role: string; content: string }[];
    sessionId?: string;
    responseLang?: "auto" | "id" | "en";
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    return new Response(JSON.stringify({ error: "Tidak ada pesan." }), { status: 400 });
  }

  // Fetch company and check quotas before doing any heavy processing
  let [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);

  // Lazy expiry: downgrade plan if subscription has expired
  if (company?.planExpiresAt && company.planExpiresAt < new Date() && company.plan !== "starter") {
    await db.update(companies)
      .set({ plan: "starter", planExpiresAt: null })
      .where(eq(companies.id, dbUser.companyId));
    company = { ...company, plan: "starter", planExpiresAt: null };
  }

  const { maxQuestionsPerMonth, maxQuestionsPerDay } = getLimits(company?.plan ?? "starter");

  const companyId = dbUser.companyId!;
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Daily quota: atomic check-and-increment in one UPDATE query.
  // PostgreSQL executes this atomically — no race condition possible.
  if (maxQuestionsPerDay !== -1) {
    const updated = await db.update(companies)
      .set({
        dailyQuestionCount: sql`CASE WHEN daily_question_date = ${today} THEN daily_question_count + 1 ELSE 1 END`,
        dailyQuestionDate: today,
      })
      .where(and(
        eq(companies.id, companyId),
        or(
          isNull(companies.dailyQuestionDate),
          sql`daily_question_date != ${today}`,
          lt(companies.dailyQuestionCount, maxQuestionsPerDay)
        )
      ))
      .returning({ id: companies.id });

    if (updated.length === 0) {
      return new Response(
        JSON.stringify({ error: "QUOTA_EXCEEDED", limit: maxQuestionsPerDay, period: "daily" }),
        { status: 429 }
      );
    }
  }

  // Monthly quota: count-based check (race window is large enough to be negligible)
  if (maxQuestionsPerMonth !== -1) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [{ total: monthlyCount }] = await db
      .select({ total: count() })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(
        eq(chatSessions.companyId, companyId),
        eq(chatMessages.role, "user"),
        gte(chatMessages.createdAt, startOfMonth)
      ));

    if (monthlyCount >= maxQuestionsPerMonth) {
      return new Response(
        JSON.stringify({ error: "QUOTA_EXCEEDED", limit: maxQuestionsPerMonth, period: "monthly" }),
        { status: 429 }
      );
    }
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await getEmbedding(lastUserMessage.content, company?.geminiApiKey);
  } catch (err) {
    const is429 = err instanceof Error && err.message.includes("429");
    return new Response(
      JSON.stringify({ error: is429 ? "AI_RATE_LIMIT" : "AI_ERROR", provider: "gemini" }),
      { status: 503 }
    );
  }

  const chunksQuery = db
    .select({
      id: documentChunks.id,
      text: documentChunks.text,
      embeddingJson: documentChunks.embeddingJson,
      documentId: documentChunks.documentId,
      documentName: documents.name,
      department: documents.department,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documentChunks.companyId, dbUser.companyId));

  const allChunks = await (dbUser.department
    ? chunksQuery.then((rows) => rows.filter((r) => !r.department || r.department === dbUser.department))
    : chunksQuery);

  // Build a full document catalog from all fetched chunks (unique doc names, no extra query)
  const docCatalogMap = new Map<string, string>(); // documentId → name
  for (const c of allChunks) {
    if (!docCatalogMap.has(c.documentId)) docCatalogMap.set(c.documentId, c.documentName);
  }
  const docCatalogNames = [...docCatalogMap.values()].sort();
  const docCatalog = docCatalogNames.length > 0
    ? `KNOWLEDGE BASE CATALOG — ${docCatalogNames.length} document(s) available:\n${docCatalogNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`
    : "KNOWLEDGE BASE CATALOG: No documents available.";

  // ~4 chars per token; reserve ~3000 tokens for system prompt + messages + output
  // Groq free tier: 12,000 TPM → safe context budget ≈ 9,000 tokens ≈ 36,000 chars
  // Groq Dev/paid tier: 100,000+ TPM → can raise this significantly
  const MAX_CONTEXT_CHARS = 36_000;

  const rankedChunks = allChunks
    .filter((c) => c.embeddingJson)
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, JSON.parse(c.embeddingJson!) as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.score > 0.5);

  // Take as many top-scored chunks as fit within the token budget
  // Cap at 5 unique documents to avoid irrelevant sources
  const MAX_UNIQUE_DOCS = 5;
  const scored: typeof rankedChunks = [];
  const seenDocs = new Set<string>();
  let totalChars = 0;
  for (const c of rankedChunks) {
    if (totalChars + c.text.length > MAX_CONTEXT_CHARS) break;
    if (!seenDocs.has(c.documentId)) {
      if (seenDocs.size >= MAX_UNIQUE_DOCS) continue;
      seenDocs.add(c.documentId);
    }
    scored.push(c);
    totalChars += c.text.length;
  }

  // Group chunks by document so the AI sees them as coherent sections
  const byDoc = new Map<string, typeof scored>();
  for (const c of scored) {
    const key = c.documentId;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key)!.push(c);
  }

  let activeSessionId = sessionId;
  if (!activeSessionId) {
    activeSessionId = randomUUID();
    await db.insert(chatSessions).values({
      id: activeSessionId,
      userId: dbUser.id,
      companyId: dbUser.companyId,
      title: lastUserMessage.content.slice(0, 60),
    });
  } else {
    // Verify the session belongs to this user's company before writing messages into it
    const [existingSession] = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, activeSessionId), eq(chatSessions.companyId, companyId)))
      .limit(1);
    if (!existingSession) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
    }
  }

  // Only bail out early when there are truly no documents at all in the knowledge base.
  // If there are documents but no relevant chunks (e.g. a meta-question like "how many docs?"),
  // continue to the AI so it can answer from the catalog.
  if (scored.length === 0 && docCatalogNames.length === 0) {
    const effectiveLang = responseLang === "auto" ? detectLang(lastUserMessage.content) : (responseLang ?? "id");
    const noDocMsg = effectiveLang === "en"
      ? "Sorry, the information could not be found in the company's internal documents."
      : "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan.";

    const noDocMsgId = randomUUID();
    await db.insert(chatMessages).values({ id: randomUUID(), sessionId: activeSessionId, role: "user", content: lastUserMessage.content });
    await db.insert(chatMessages).values({ id: noDocMsgId, sessionId: activeSessionId, role: "assistant", content: noDocMsg, citationsJson: "[]" });

    const encoder2 = new TextEncoder();
    const { readable: r2, writable: w2 } = new TransformStream<Uint8Array, Uint8Array>();
    const writer2 = w2.getWriter();
    (async () => {
      await writer2.write(encoder2.encode(`2:${JSON.stringify({ citations: [], messageId: noDocMsgId, sessionId: activeSessionId })}\n`));
      await writer2.write(encoder2.encode(`0:${JSON.stringify(noDocMsg)}\n`));
      await writer2.close();
    })();
    return new Response(r2, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const contextText = byDoc.size > 0
    ? Array.from(byDoc.entries())
        .map(([, chunks]) => {
          const docName = chunks[0].documentName;
          const body = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
          return `=== ${docName} ===\n${body}`;
        })
        .join("\n\n")
    : "(No specific excerpts retrieved — answer from the catalog above if relevant.)";

  const aiName = company?.aiName ?? "IntelliBase AI";
  const aiPersonality = company?.aiPersonality ? `\n\nKEPRIBADIAN & GAYA:\n${company.aiPersonality}` : "";

  const langInstruction = responseLang === "en"
    ? `LANGUAGE RULE (ABSOLUTE — OVERRIDES ALL OTHER RULES):
You MUST write your ENTIRE response in ENGLISH only.
Do NOT use any Indonesian words. Do NOT mix languages.
Even if the user writes in Indonesian, your response MUST be 100% in English.
If no relevant information is found in the documents, respond with exactly: "Sorry, the information could not be found in the company's internal documents."
Violation of this rule is not acceptable under any circumstance.`
    : responseLang === "id"
    ? `ATURAN BAHASA (MUTLAK — MENGGANTIKAN SEMUA ATURAN LAIN):
Anda WAJIB menulis SELURUH respons dalam Bahasa Indonesia yang baik dan benar.
JANGAN gunakan kata-kata dalam bahasa Inggris kecuali istilah teknis dari dokumen.
Jika informasi tidak ditemukan dalam dokumen, balas dengan: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan."
Tidak ada pengecualian untuk aturan ini.`
    : `LANGUAGE RULE (AUTO-DETECT):
Detect the language of the user's question and respond in that SAME language.
- User writes in Indonesian → respond entirely in Indonesian.
- User writes in English → respond entirely in English.
- Do NOT mix languages in a single response.
If no relevant information is found:
- Indonesian question → "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan."
- English question → "Sorry, the information could not be found in the company's internal documents."`;

  const langReminder = responseLang === "en"
    ? "Remember: respond in ENGLISH only, regardless of the question language."
    : responseLang === "id"
    ? "Ingat: respons dalam BAHASA INDONESIA saja, terlepas dari bahasa pertanyaan."
    : "Remember: detect the user's question language and respond in that same language.";

  const systemPromptWithContext = `You are ${aiName}, an internal AI assistant.${aiPersonality}\n\n${SYSTEM_PROMPT}\n\n${langInstruction}\n\n---\n${docCatalog}\n\n---\nINTERNAL DOCUMENT CONTEXT (relevant excerpts):\n${contextText}\n---\n\n${langReminder}`;

  const userMsgId = randomUUID();
  await db.insert(chatMessages).values({
    id: userMsgId,
    sessionId: activeSessionId,
    role: "user",
    content: lastUserMessage.content,
  });

  const citations = scored.map((c) => ({ id: c.id, text: c.text, documentName: c.documentName }));
  const assistantMsgId = randomUUID();

  const typedMessages = messages as { role: "user" | "assistant"; content: string }[];
  const lastMsg = typedMessages[typedMessages.length - 1];
  const prevMsgs = typedMessages.slice(0, -1);

  const langDemo =
    responseLang === "en"
      ? [
          { role: "user" as const, content: "What language will you use to answer me?" },
          { role: "assistant" as const, content: "I will answer entirely in English, regardless of the language of the documents or your question. This is my strict rule for this session." },
        ]
      : responseLang === "id"
      ? [
          { role: "user" as const, content: "Bahasa apa yang akan kamu gunakan untuk menjawab saya?" },
          { role: "assistant" as const, content: "Saya akan menjawab seluruhnya dalam Bahasa Indonesia yang baik dan benar, terlepas dari bahasa dokumen atau pertanyaan. Ini adalah aturan sesi ini." },
        ]
      : [
          { role: "user" as const, content: "What language will you use?" },
          { role: "assistant" as const, content: "I will automatically detect the language of your question and respond in that same language. Ask in Indonesian and I will answer in Indonesian; ask in English and I will answer in English." },
        ];

  const messagesWithLang = [...prevMsgs, ...langDemo, lastMsg];

  const groqClient = company?.groqApiKey ? createGroq({ apiKey: company.groqApiKey }) : groq;

  const result = streamText({
    model: groqClient("llama-3.3-70b-versatile"),
    system: systemPromptWithContext,
    messages: messagesWithLang,
    onFinish: async ({ text }) => {
      await db.insert(chatMessages).values({
        id: assistantMsgId,
        sessionId: activeSessionId!,
        role: "assistant",
        content: text,
        citationsJson: JSON.stringify(citations),
      });
    },
  });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    let closed = false;
    const closeWriter = async () => { if (!closed) { closed = true; await writer.close(); } };

    try {
      await writer.write(encoder.encode(`2:${JSON.stringify({ citations, messageId: assistantMsgId, sessionId: activeSessionId })}\n`));

      let fullText = "";
      try {
        for await (const chunk of result.textStream) {
          fullText += chunk;
          await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota");
        await writer.write(encoder.encode(`1:${JSON.stringify({ error: is429 ? "AI_RATE_LIMIT" : "AI_ERROR", provider: "groq" })}\n`));
        await closeWriter();
        return;
      }

      // Generate suggested follow-up questions — silently skip if this fails
      try {
        const effectiveSuggestLang = responseLang === "auto" ? detectLang(lastUserMessage.content) : (responseLang ?? "id");
        const suggestLang = effectiveSuggestLang === "en" ? "English" : "Bahasa Indonesia";
        const { text: suggestionsRaw } = await generateText({
          model: groqClient("llama-3.3-70b-versatile"),
          prompt: `Based on this Q&A, generate exactly 3 short follow-up questions a user might ask next. Return ONLY a JSON array of 3 strings, no explanation. Write questions in ${suggestLang}.

Question: ${lastUserMessage.content}
Answer: ${fullText.slice(0, 500)}

Return format: ["question 1", "question 2", "question 3"]`,
        });

        const match = suggestionsRaw.match(/\[[\s\S]*\]/);
        if (match) {
          const suggestions = JSON.parse(match[0]) as string[];
          await writer.write(encoder.encode(`3:${JSON.stringify(suggestions.slice(0, 3))}\n`));
        }
      } catch {}
    } finally {
      await closeWriter();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
