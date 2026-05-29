import { NextRequest } from "next/server";
import { streamText } from "ai";
import { groq } from "@ai-sdk/groq";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentChunks, users, chatSessions, chatMessages, documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { randomUUID } from "crypto";

const SYSTEM_PROMPT = `Anda adalah asisten AI internal perusahaan yang membantu karyawan menemukan informasi dari dokumen internal seperti SOP, regulasi HR, dan panduan IT.

Aturan yang WAJIB diikuti:
1. Jawab HANYA berdasarkan konteks dokumen yang diberikan di bawah ini.
2. Apabila jawaban tidak dapat divalidasi dari teks konteks tersebut, jawab dengan: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan."
3. Jangan mencoba mengarang atau menebak jawaban di luar konteks.
4. PENTING: Deteksi bahasa yang digunakan pengguna dan jawab dalam bahasa yang SAMA. Jika pengguna bertanya dalam Bahasa Indonesia, jawab dalam Bahasa Indonesia. Jika dalam Bahasa Inggris, jawab dalam Bahasa Inggris.
5. Gunakan format yang rapi: gunakan bold untuk judul/poin penting, bullet list untuk langkah-langkah.`;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) {
    return new Response(JSON.stringify({ error: "User tidak ditemukan." }), { status: 403 });
  }

  const { messages, sessionId } = await req.json() as {
    messages: { role: string; content: string }[];
    sessionId?: string;
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

  const systemPromptWithContext = `${SYSTEM_PROMPT}\n\n---\nKONTEKS DOKUMEN INTERNAL:\n${contextText}\n---`;

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
