// Uses only the fixed public-demo namespace. No auth user or login is created.
// Run with the TS resolve hook (npm run demo:seed); never from a public route.
import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "../src/lib/db/tenant.ts";
import { companies, documents, documentChunks, users } from "../src/lib/db/schema.ts";
import { chunkText } from "../src/lib/chunker.ts";
import { getEmbeddings } from "../src/lib/embeddings.ts";
import { DEMO_COMPANY_ID, DEMO_DOCUMENTS, DEMO_LABEL, demoDocumentId, demoDocumentName, demoDocumentText } from "../src/lib/demo/corpus.ts";

if (!process.env.DATABASE_URL || !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  throw new Error("DATABASE_URL and GOOGLE_GENERATIVE_AI_API_KEY are required.");
}
const docs = DEMO_DOCUMENTS.map((doc) => ({ id: demoDocumentId(doc.slug), companyId: DEMO_COMPANY_ID, name: demoDocumentName(doc.title), rawText: demoDocumentText(doc), status: "success" as const }));
const chunks = docs.flatMap((doc) => chunkText(doc.rawText).map((text, chunkIndex) => ({
  id: `${doc.id}:${chunkIndex}`, companyId: DEMO_COMPANY_ID, documentId: doc.id, text, chunkIndex,
})));

async function inspect(tx: Parameters<Parameters<typeof withTenant>[1]>[0]) {
  const existing = await tx.select().from(companies).where(eq(companies.id, DEMO_COMPANY_ID));
  const members = await tx.select({ id: users.id }).from(users).where(eq(users.companyId, DEMO_COMPANY_ID)).limit(1);
  if (members.length || (existing.length && existing[0].name !== DEMO_LABEL)) throw new Error("Reserved demo namespace is occupied; refusing to change it.");
  const stored = await tx.select().from(documents).where(eq(documents.companyId, DEMO_COMPANY_ID));
  for (const row of stored) {
    const expected = docs.find((d) => d.id === row.id);
    if (!expected || expected.rawText !== row.rawText || expected.name !== row.name) throw new Error("Unexpected document in demo workspace; refusing to overwrite.");
  }
  const storedChunks = await tx.select().from(documentChunks).where(eq(documentChunks.companyId, DEMO_COMPANY_ID));
  for (const row of storedChunks) {
    const expected = chunks.find((c) => c.id === row.id);
    if (!expected || expected.text !== row.text || expected.documentId !== row.documentId) throw new Error("Unexpected chunk in demo workspace; refusing to overwrite.");
  }
  return stored.length === docs.length && stored.every((d) => d.status === "success") && storedChunks.length === chunks.length && storedChunks.every((c) => c.embedding?.length === 1536);
}

if (await withTenant(DEMO_COMPANY_ID, inspect)) {
  console.info(`Demo already indexed: ${docs.length} documents, ${chunks.length} chunks. No changes.`);
} else {
  const vectors = await getEmbeddings(chunks.map((c) => c.text));
  if (vectors.length !== chunks.length || vectors.some((v) => v.length !== 1536 || v.some((n) => !Number.isFinite(n)))) throw new Error("Invalid embeddings");
  await withTenant(DEMO_COMPANY_ID, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${DEMO_COMPANY_ID}))`);
    await inspect(tx);
    await tx.insert(companies).values({ id: DEMO_COMPANY_ID, name: DEMO_LABEL }).onConflictDoNothing();
    for (const doc of docs) {
      await tx.insert(documents).values(doc).onConflictDoNothing();
      await tx.update(documents).set({ status: "success" }).where(and(eq(documents.id, doc.id), eq(documents.companyId, DEMO_COMPANY_ID)));
    }
    for (const [index, chunk] of chunks.entries()) {
      await tx.insert(documentChunks).values({ ...chunk, embedding: vectors[index] }).onConflictDoUpdate({
        target: documentChunks.id, set: { embedding: vectors[index] }, setWhere: eq(documentChunks.companyId, DEMO_COMPANY_ID),
      });
    }
  });
  console.info(`Indexed demo: ${docs.length} fictional documents, ${chunks.length} chunks; gemini-embedding-001 / 1536 dimensions. No customer workspace changed.`);
}
