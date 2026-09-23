import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runIndexingSweep } from "@/lib/indexing-worker";

export const dynamic = "force-dynamic";

// No maxDuration on purpose, for the same reason as the payment sweep: declaring
// one above the hosting plan's ceiling fails the deployment, and `main` deploys
// itself. The run is bounded below instead, by a budget short enough to fit
// inside any plan's limit, and it is resumable by construction — a shorter run
// just indexes fewer documents.

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

// Daily fallback for the standalone worker and browser. All drivers share
// persisted company rotation, checkpointing, claim leases and key cooldowns.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    // Same answer whether the secret is wrong or unset — an unauthenticated
    // caller learns nothing about which.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runIndexingSweep();
  return NextResponse.json(result);
}
