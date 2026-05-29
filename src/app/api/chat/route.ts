import { NextRequest } from "next/server";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentChunks, users, chatSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { randomUUID } from "crypto";

const SYSTEM_PROMPT = `Anda adalah asisten AI internal perusahaan yang membantu karyawan menemukan informasi dari dokumen internal seperti SOP, regulasi HR, dan panduan IT.

Aturan yang WAJIB diikuti:
1. Jawab HANYA berdasarkan konteks dokumen yang diberikan di bawah ini.
2. Apabila jawaban tidak dapat divalidasi dari teks konteks tersebut, jawab dengan TEPAT: "Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan."
3. Jangan mencoba mengarang atau menebak jawaban di luar konteks.
4. Gunakan bahasa Indonesia yang formal dan profesional.
5. Jika menemukan informasi relevan, berikan jawaban yang ringkas dan jelas.`;

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

  const allChunks = await db
    .select({
      id: documentChunks.id,
      text: documentChunks.text,
      embeddingJson: documentChunks.embeddingJson,
      documentId: documentChunks.documentId,
    })
    .from(documentChunks)
    .where(eq(documentChunks.companyId, dbUser.companyId));

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

  if (!sessionId) {
    await db.insert(chatSessions).values({
      id: randomUUID(),
      userId: dbUser.id,
      companyId: dbUser.companyId,
      title: lastUserMessage.content.slice(0, 60),
    });
  }

  const citations = scored.map((c) => ({ id: c.id, text: c.text }));

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPromptWithContext,
    messages: messages as { role: "user" | "assistant"; content: string }[],
  });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      await writer.write(encoder.encode(`2:${JSON.stringify(citations)}\n`));
      const stream = result.textStream;
      for await (const chunk of stream) {
        await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
      }
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
