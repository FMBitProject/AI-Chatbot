import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { resolvePlanById } from "@/lib/subscription";
import { runIndexingPass, requeueDocument } from "@/lib/indexing";

// One pass may spend up to INDEX_RUN_BUDGET_MS working, and the document it is
// on when the budget expires still has to finish. 300s leaves room for both.
export const maxDuration = 300;

// Never served from a cache: the whole point of a call here is to change state.
export const dynamic = "force-dynamic";

interface Body {
  // Put one failed document back in the queue before draining it.
  documentId?: string;
}

/**
 * Drains this company's indexing queue for as long as one invocation may run,
 * and reports how much is left.
 *
 * The caller is expected to come back: the admin dashboard calls this in a loop
 * while `remaining > 0`, which is what turns a 500-document import into a
 * sequence of bounded, individually survivable invocations rather than one
 * request that must not fail. Nothing is lost if the caller stops — the queue is
 * in the database, and the nightly cron drains whatever the browser did not.
 *
 * Safe to call concurrently with itself and with the cron; documents are claimed
 * one at a time with FOR UPDATE SKIP LOCKED (see @/lib/indexing).
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  // resolvePlanById rather than a plain select: it applies a pending expiry
  // downgrade, and it hands back the row carrying the company's own Gemini and
  // Groq keys, which is what the indexer embeds and summarises with.
  const { company } = await resolvePlanById(companyId);
  if (!company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as Body;

  if (body.documentId) {
    const requeued = await requeueDocument(companyId, body.documentId);
    if (!requeued) {
      // Either it is not this company's document, or it is not in a state that
      // can be retried — a parse failure keeps no text, so there is nothing to
      // index and the file has to be uploaded again.
      return NextResponse.json({
        error: "Dokumen ini tidak bisa diindeks ulang. Kalau file-nya gagal dibaca saat upload, upload ulang filenya.",
      }, { status: 400 });
    }
  }

  const result = await runIndexingPass(company);
  return NextResponse.json(result);
}
