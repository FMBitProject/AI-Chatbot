import { NextRequest } from "next/server";
import { streamText } from "ai";
import { groq } from "@ai-sdk/groq";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentChunks, users, chatSessions, chatMessages, documents } from "@/lib/db/schema";
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
    .slice(0, 4);

  const contextText =
    scored.length > 0
      ? scored.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n")
      : "Tidak ada dokumen yang ditemukan dalam basis pengetahuan perusahaan.";

  const langInstruction = responseLang === "en"
    ? "IMPORTANT: You MUST respond in English regardless of the language used in the question."
    : "PENTING: Anda HARUS merespons dalam Bahasa Indonesia yang baik dan benar, terlepas dari bahasa yang digunakan dalam pertanyaan.";

  const systemPromptWithContext = `${SYSTEM_PROMPT}\n\n${langInstruction}\n\n---\nINTERNAL DOCUMENT CONTEXT:\n${contextText}\n---`;

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

  const result = streamText({
    model: groq("llama-3.1-8b-instant"),
    system: systemPromptWithContext,
    messages: messages as { role: "user" | "assistant"; content: string }[],
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
      for await (const chunk of result.textStream) {
        await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
