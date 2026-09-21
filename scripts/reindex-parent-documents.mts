// Dry run by default; one explicit workspace per invocation. The existing
// indexer/cron performs provider work and atomically replaces old chunks.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { withTenant } from "../src/lib/db/tenant.ts";
import { documents, documentChunks } from "../src/lib/db/schema.ts";
import { DEMO_COMPANY_ID } from "../src/lib/demo/corpus.ts";

const args = process.argv.slice(2);
const companyId = args[0];
if (!companyId || args.length > 2 || (args[1] && args[1] !== "--apply")) {
  throw new Error("Usage: npm run rag:reindex -- <company-id> [--apply]");
}
if (companyId === DEMO_COMPANY_ID) throw new Error("Public demo uses its own versioned seed; do not requeue it here.");
await withTenant(companyId, async tx => {
  const eligible = and(
    eq(documents.companyId, companyId), eq(documents.status, "success"), isNotNull(documents.rawText),
    sql`exists (select 1 from ${documentChunks} where ${documentChunks.documentId} = ${documents.id}
      and ${documentChunks.companyId} = ${companyId} and ${documentChunks.parentIndex} is null)`,
  );
  if (args[1] === "--apply") {
    const rows = await tx.update(documents)
      .set({ status: "queued", errorMessage: null, indexingStartedAt: null })
      .where(eligible).returning({ id: documents.id });
    console.log(`Queued ${rows.length} legacy documents. Existing chunks stay searchable until replacement commits.`);
  } else {
    const rows = await tx.select({ id: documents.id }).from(documents).where(eligible);
    console.log(`${rows.length} legacy documents eligible. Use --apply to queue them for re-indexing.`);
  }
});
