import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { runIndexingPass } from "@/lib/indexing";

export const dynamic = "force-dynamic";

// No maxDuration on purpose, for the same reason as the payment sweep: declaring
// one above the hosting plan's ceiling fails the deployment, and `main` deploys
// itself. The run is bounded below instead, by a budget short enough to fit
// inside any plan's limit, and it is resumable by construction — a shorter run
// just indexes fewer documents.

// Upper bound on one run. Documents left over stay "queued" and are picked up by
// the browser-driven pass or by tomorrow's run.
const RUN_BUDGET_MS = 45 * 1000;

// Per company, so one tenant with a thousand queued documents cannot consume the
// whole run and leave every other tenant unindexed until the next day.
const PER_COMPANY_BUDGET_MS = 15 * 1000;

if (!process.env.CRON_SECRET) {
  console.warn("[cron/index-documents] CRON_SECRET is not set — this route will reject every caller, including Vercel Cron.");
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = req.headers.get("authorization");
  if (!provided) return false;

  // Constant-time, so the response time cannot be used to recover the secret a
  // character at a time. timingSafeEqual throws on a length mismatch, hence the
  // length check first.
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(`Bearer ${secret}`, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Indexes documents that were uploaded but never finished indexing.
 *
 * The admin's browser is the normal driver: it uploads, then calls
 * /api/admin/indexing until the queue is empty. That covers the case where
 * someone is watching. This route covers the cases where nobody is — a closed
 * tab halfway through a 500-file import, a deploy that killed a pass, a Gemini
 * rate limit that pushed the last documents back into the queue.
 *
 * It also returns documents stranded in "processing" by a killed invocation,
 * which is the one repair no user action can trigger.
 *
 * Called by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer $CRON_SECRET`. Hobby plans only allow a daily cron, so
 * this is a safety net rather than the primary path — anything it picks up would
 * otherwise have waited for the admin to open the dashboard again.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    // Same answer whether the secret is wrong or unset — an unauthenticated
    // caller learns nothing about which.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Every company, oldest first, rather than "companies with queued documents":
  // documents is RLS-protected and FORCE ROW LEVEL SECURITY applies to the table
  // owner too, so there is no query outside a tenant transaction that can see
  // which companies have work waiting. Asking each company in turn costs one
  // cheap indexed count per company, and companies is not a table that grows
  // faster than that can absorb.
  const rows = await db.select().from(companies).orderBy(asc(companies.createdAt));

  let scanned = 0;
  let indexed = 0;
  let failed = 0;
  let remaining = 0;
  let busy = 0;

  for (const company of rows) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    scanned++;
    try {
      const result = await runIndexingPass(company, { budgetMs: PER_COMPANY_BUDGET_MS });
      indexed += result.indexed;
      failed += result.failed;
      remaining += result.remaining;
      // An admin was importing when the cron came round, so this company's queue
      // was already being drained by their browser. Skipped rather than fought
      // over: a second pass shares one rate limit with the first and would slow
      // down the very import it is trying to help. Counted, because "the cron
      // did nothing for anyone" and "everyone was already busy" look identical
      // in the totals otherwise.
      if (result.stop === "busy") busy++;
    } catch (error) {
      // One tenant's failure must not end the sweep for the rest.
      console.error(`[cron/index-documents] Pass failed for company=${company.id}:`, error);
    }
  }

  if (indexed > 0 || failed > 0 || remaining > 0) {
    console.log(`[cron/index-documents] scanned=${scanned} indexed=${indexed} failed=${failed} remaining=${remaining} busy=${busy}`);
  }

  return NextResponse.json({ scanned, indexed, failed, remaining, busy });
}
