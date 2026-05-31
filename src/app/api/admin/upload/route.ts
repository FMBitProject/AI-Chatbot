import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, documentChunks, users, companies } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getLimits, isUnderLimit } from "@/lib/plan-limits";
import { chunkText } from "@/lib/chunker";
import { getEmbedding } from "@/lib/embeddings";
import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { randomUUID } from "crypto";

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Format file tidak didukung: ${file.name}`);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = dbUser.companyId;

  // Enforce plan limits
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const limits = getLimits(company?.plan ?? "starter");
  const [{ count: docCount }] = await db.select({ count: count() }).from(documents).where(eq(documents.companyId, companyId));
  if (!isUnderLimit(docCount, limits.maxDocuments)) {
    return NextResponse.json({
      error: `Batas dokumen paket ${company?.plan ?? "Starter"} sudah tercapai (${limits.maxDocuments} dokumen). Upgrade paket untuk menambah lebih banyak.`,
    }, { status: 403 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "Tidak ada file yang dikirim." }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  const results: { id: string; name: string; status: string; createdAt: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" melebihi batas 10 MB.` },
        { status: 413 }
      );
    }

    const docId = randomUUID();
    await db.insert(documents).values({
      id: docId,
      name: file.name,
      companyId,
      status: "processing",
    });

    try {
      const rawText = await extractText(file);
      const chunks = chunkText(rawText);

      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        await db.insert(documentChunks).values({
          id: randomUUID(),
          documentId: docId,
          companyId,
          text: chunks[i],
          embeddingJson: JSON.stringify(embedding),
          chunkIndex: i,
        });
      }

      // Auto-generate document summary
      const sampleText = chunks.slice(0, 3).join("\n\n").slice(0, 2000);
      let summary: string | null = null;
      try {
        const { text } = await generateText({
          model: groq("llama-3.3-70b-versatile"),
          prompt: `Buat ringkasan profesional dari dokumen berikut dalam 3-5 poin utama menggunakan Bahasa Indonesia. Format: bullet points singkat dan jelas. Dokumen: "${file.name}"\n\nIsi:\n${sampleText}\n\nRingkasan (3-5 poin):`,
        });
        summary = text.trim();
      } catch {}

      await db.update(documents).set({ status: "success", summary }).where(eq(documents.id, docId));
      results.push({ id: docId, name: file.name, status: "success", createdAt: new Date().toISOString() });

    } catch (error) {
      console.error(`[upload] Error processing ${file.name}:`, error);
      await db.update(documents).set({ status: "failed" }).where(eq(documents.id, docId));
      results.push({ id: docId, name: file.name, status: "failed", createdAt: new Date().toISOString() });
    }
  }

  return NextResponse.json({ documents: results });
}
