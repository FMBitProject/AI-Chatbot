// Run under a process supervisor; does not depend on Next or an open browser.
import { setTimeout as delay } from "node:timers/promises";
import { runIndexingSweep } from "../src/lib/indexing-worker.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (process.argv.slice(2).some(arg => arg !== "--once")) throw new Error("Usage: npm run indexing:worker -- [--once]");
let stopping = false;
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  stopping = true;
  shutdown.abort();
});
do {
  try {
    const started = Date.now();
    const result = await runIndexingSweep({ budgetMs: 120_000, perCompanyBudgetMs: 90_000, shouldStop: () => stopping });
    console.log(JSON.stringify({ event: "indexing_sweep", durationMs: Date.now() - started, ...result }));
  } catch (error) {
    console.error("[indexing-worker] Sweep failed", error);
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
  if (stopping || process.argv.includes("--once")) break;
  await delay(5000, undefined, { signal: shutdown.signal }).catch(() => {});
} while (!stopping);
