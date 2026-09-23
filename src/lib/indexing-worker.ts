import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { runIndexingPass } from "@/lib/indexing";

// Persist the rotation before doing work, including failed/empty companies.
// A bounded cron invocation therefore continues the rotation on its next run.
export async function runIndexingSweep(opts: { budgetMs?: number; perCompanyBudgetMs?: number; shouldStop?: () => boolean } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const rows = await db.select().from(companies)
    .orderBy(sql`${companies.indexingCheckedAt} asc nulls first`, asc(companies.id)).limit(100);
  const totals = { scanned: 0, indexed: 0, failed: 0, remaining: 0, busy: 0 };
  for (const company of rows) {
    if (opts.shouldStop?.() || Date.now() >= deadline) break;
    await db.update(companies).set({ indexingCheckedAt: new Date() }).where(eq(companies.id, company.id));
    totals.scanned++;
    try {
      const result = await runIndexingPass(company, { budgetMs: Math.min(opts.perCompanyBudgetMs ?? 15_000, deadline - Date.now()) });
      totals.indexed += result.indexed;
      totals.failed += result.failed;
      totals.remaining += result.remaining;
      if (result.stop === "busy") totals.busy++;
    } catch (error) {
      console.error(`[indexing-worker] company=${company.id}`, error);
    }
  }
  return totals;
}
