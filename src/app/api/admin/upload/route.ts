import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, documentChunks, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { chunkText } from "@/lib/chunker";
import { getEmbedding } from "@/lib/embeddings";
import { randomUUID } from "crypto";

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default ?? pdfParseModule;
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

      await db.update(documents).set({ status: "success" }).where(eq(documents.id, docId));
      results.push({ id: docId, name: file.name, status: "success", createdAt: new Date().toISOString() });
    } catch (error) {
      console.error(`[upload] Error processing ${file.name}:`, error);
      await db.update(documents).set({ status: "failed" }).where(eq(documents.id, docId));
      results.push({ id: docId, name: file.name, status: "failed", createdAt: new Date().toISOString() });
    }
  }

  return NextResponse.json({ documents: results });
}
