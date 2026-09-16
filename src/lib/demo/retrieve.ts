import { sql } from "drizzle-orm";
import { withTenant } from "@/lib/db/tenant";
import { getEmbedding } from "@/lib/embeddings";
import { retrieveChunks } from "@/lib/retrieval";
import { chunkText } from "@/lib/chunker";
import { DEMO_COMPANY_ID, DEMO_DOCUMENTS, demoDocumentId, demoDocumentName, demoDocumentText } from "./corpus";

const expectedChunks = new Map<string, { text: string; documentId: string; documentName: string }>(DEMO_DOCUMENTS.flatMap((doc) =>
  chunkText(demoDocumentText(doc)).map((text, index) => [
    `${demoDocumentId(doc.slug)}:${index}`,
    { text, documentId: demoDocumentId(doc.slug), documentName: demoDocumentName(doc.title) },
  ] as const),
));

export async function retrieveDemoChunks(question: string) {
  // No BYOK resolution: public traffic never spends customer credentials.
  const queryEmbedding = await getEmbedding(question);
  return withTenant(DEMO_COMPANY_ID, async (tx) => {
    await tx.execute(sql`set local transaction_read_only = on`);
    const chunks = await retrieveChunks({
      companyId: DEMO_COMPANY_ID,
      queryEmbedding,
      access: { role: "employee", department: null },
      limit: 4,
      minScore: 0.5,
    }, tx);
    // Exact allowlist protects the public output even if someone later adds a
    // private document to this workspace. Only versioned, authored text leaves
    // the server; unknown/modified chunks fail closed before reaching the LLM.
    return chunks.filter((chunk) => {
      const expected = expectedChunks.get(chunk.id);
      return expected && chunk.documentId === expected.documentId &&
        chunk.documentName === expected.documentName && chunk.text === expected.text;
    });
  });
}
