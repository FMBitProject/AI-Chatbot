import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { documents, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const companyId = dbUser.companyId;
  // documents is RLS-protected; the delete runs in a tenant-scoped transaction.
  // The explicit companyId predicate is defence-in-depth on top of the policy.
  // document_chunks cascade-deletes via its FK (RI actions bypass RLS).
  await withTenant(companyId, (tx) =>
    tx.delete(documents).where(and(eq(documents.id, id), eq(documents.companyId, companyId))));

  return NextResponse.json({ ok: true });
}
