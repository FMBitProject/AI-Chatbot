import { NextRequest } from "next/server";
import { streamText, generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentChunks, users, chatSessions, chatMessages, documents, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { randomUUID } from "crypto";

const SYSTEM_PROMPT = `You are an internal AI assistant for a company, helping employees find accurate information from official internal documents such as SOPs, HR regulations, and IT guidelines.

MANDATORY RULES:
1. Answer ONLY based on the document context provided below. Do not add information from outside the context.
2. If the answer cannot be validated from the provided context, respond with exactly: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan." (if user asks in Indonesian) or "Sorry, the information could not be found in the company's internal documents." (if user asks in English).
3. Never fabricate, guess, or extrapolate answers beyond what is explicitly stated in the context.
4. LANGUAGE: Detect the language of the user's question and respond in the SAME language.
5. TERMINOLOGY: Always use the EXACT technical terms, abbreviations, and proper nouns as they appear in the source documents. Do NOT translate domain-specific or technical terms (e.g., if the document uses "Fair Market Value", "honorarium", "HCP Engagement", use those exact terms — do not substitute with informal translations).
6. SPELLING & GRAMMAR: Use correct, professional spelling and grammar at all times. For Indonesian responses, strictly follow PUEBI (Pedoman Umum Ejaan Bahasa Indonesia). Common errors to avoid: "menspesifikasikan" NOT "menspecifikasikan", "persentase" NOT "prosentase", "jadwal" NOT "jadual".
7. TONE: Maintain a formal, professional tone appropriate for a corporate internal knowledge base.
8. FORMAT: Use clear formatting — bold for key terms/headings, bullet points for steps or lists, numbered lists for sequential procedures.`;

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
    responseLang?: "id" | "en";
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    return new Response(JSON.stringify({ error: "Tidak ada pesan." }), { status: 400 });
  }

  const queryEmbedding = await getEmbedding(lastUserMessage.content);

  const chunksQuery = db
    .select({
      id: documentChunks.id,
      text: documentChunks.text,
      embeddingJson: documentChunks.embeddingJson,
      documentId: documentChunks.documentId,
      department: documents.department,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documentChunks.companyId, dbUser.companyId));

  const allChunks = await (dbUser.department
    ? chunksQuery.then((rows) => rows.filter((r) => !r.department || r.department === dbUser.department))
    : chunksQuery);

  const scored = allChunks
    .filter((c) => c.embeddingJson)
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, JSON.parse(c.embeddingJson!) as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.score > 0.35)
    .slice(0, 20);

  const contextText =
    scored.length > 0
      ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "Tidak ada dokumen yang ditemukan dalam basis pengetahuan perusahaan.";

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  const aiName = company?.aiName ?? "IntelliBase AI";
  const aiPersonality = company?.aiPersonality ? `\n\nKEPRIBADIAN & GAYA:\n${company.aiPersonality}` : "";

  const langInstruction = responseLang === "en"
    ? `CRITICAL LANGUAGE RULE — THIS OVERRIDES EVERYTHING ELSE:
You MUST write your ENTIRE response in ENGLISH only.
Do NOT use any Indonesian words. Do NOT mix languages.
Even if the user writes in Indonesian, your response must be 100% in English.
Violation of this rule is not acceptable.`
    : `ATURAN BAHASA MUTLAK — INI MENGGANTIKAN SEMUA ATURAN LAIN:
Anda WAJIB menulis SELURUH respons dalam Bahasa Indonesia yang baik dan benar.
JANGAN gunakan kata-kata dalam bahasa Inggris kecuali istilah teknis dari dokumen.
Tidak ada pengecualian untuk aturan ini.`;

  const systemPromptWithContext = `You are ${aiName}, an internal AI assistant.${aiPersonality}\n\n${SYSTEM_PROMPT}\n\n${langInstruction}\n\n---\nINTERNAL DOCUMENT CONTEXT:\n${contextText}\n---\n\n${responseLang === "en" ? "Remember: respond in ENGLISH only." : "Ingat: respons dalam BAHASA INDONESIA saja."}`;

  let activeSessionId = sessionId;
  if (!activeSessionId) {
    activeSessionId = randomUUID();
    await db.insert(chatSessions).values({
      id: activeSessionId,
      userId: dbUser.id,
      companyId: dbUser.companyId,
      title: lastUserMessage.content.slice(0, 60),
    });
  }

  const userMsgId = randomUUID();
  await db.insert(chatMessages).values({
    id: userMsgId,
    sessionId: activeSessionId,
    role: "user",
    content: lastUserMessage.content,
  });

  const citations = scored.map((c) => ({ id: c.id, text: c.text }));
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
      : [
          { role: "user" as const, content: "Bahasa apa yang akan kamu gunakan untuk menjawab saya?" },
          { role: "assistant" as const, content: "Saya akan menjawab seluruhnya dalam Bahasa Indonesia yang baik dan benar, terlepas dari bahasa dokumen atau pertanyaan. Ini adalah aturan sesi ini." },
        ];

  const messagesWithLang = [...prevMsgs, ...langDemo, lastMsg];

  const result = streamText({
    model: groq("llama-3.3-70b-versatile"),
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
    try {
      await writer.write(encoder.encode(`2:${JSON.stringify({ citations, messageId: assistantMsgId, sessionId: activeSessionId })}\n`));

      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
        await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
      }

      // Generate suggested follow-up questions
      const suggestLang = responseLang === "en" ? "English" : "Bahasa Indonesia";
      const { text: suggestionsRaw } = await generateText({
        model: groq("llama-3.3-70b-versatile"),
        prompt: `Based on this Q&A, generate exactly 3 short follow-up questions a user might ask next. Return ONLY a JSON array of 3 strings, no explanation. Write questions in ${suggestLang}.

Question: ${lastUserMessage.content}
Answer: ${fullText.slice(0, 500)}

Return format: ["question 1", "question 2", "question 3"]`,
      });

      try {
        const match = suggestionsRaw.match(/\[[\s\S]*\]/);
        if (match) {
          const suggestions = JSON.parse(match[0]) as string[];
          await writer.write(encoder.encode(`3:${JSON.stringify(suggestions.slice(0, 3))}\n`));
        }
      } catch {}
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
