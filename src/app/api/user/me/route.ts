import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";

/**
 * The caller's own identity, as far as the interface needs it.
 *
 * It exists for the pages that must render differently for an individual account
 * but are not admin pages — the pricing page most of all, which a signed-in
 * individual reaches from "Upgrade Paket" and which must show them the plan they
 * can actually buy rather than three team tiers the checkout will refuse.
 *
 * Why not the session: better-auth mints the session cookie at sign-in and keeps
 * it for seven days, and `accountType` lives on the workspace row, not the user
 * row it can carry. Why not /api/admin/company: that answers 403 for an
 * employee, and this is read by pages employees see.
 *
 * Deliberately three fields. It is tempting to make this "the user object" and
 * let it grow; the guard's own comment about `select()` applies just as well to
 * a response shape — everything added here flows into every page that calls it.
 */
export async function GET(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    name: guard.user.name,
    role: guard.user.role,
    accountType: guard.user.accountType,
  });
}
