import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const { id } = await params;
  // documents is RLS-protected; the delete runs in a tenant-scoped transaction.
  // The explicit companyId predicate is defence-in-depth on top of the policy.
  // document_chunks cascade-deletes via its FK (RI actions bypass RLS).
  await withTenant(companyId, (tx) =>
    tx.delete(documents).where(and(eq(documents.id, id), eq(documents.companyId, companyId))));

  return NextResponse.json({ ok: true });
}
