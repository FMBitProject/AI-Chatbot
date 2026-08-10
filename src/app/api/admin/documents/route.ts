import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  // Named columns rather than select(): `raw_text` holds the full text of every
  // uploaded document, and this endpoint is polled every three seconds while an
  // import is running. Sending it would mean shipping the company's entire
  // document library to the browser, repeatedly, for a list that shows a name, a
  // badge and a date.
  const docs = await withTenant(companyId, (tx) =>
    tx.select({
      id: documents.id,
      name: documents.name,
      status: documents.status,
      errorMessage: documents.errorMessage,
      summary: documents.summary,
      department: documents.department,
      expiresAt: documents.expiresAt,
      createdAt: documents.createdAt,
    }).from(documents).where(eq(documents.companyId, companyId)));
  return NextResponse.json(docs);
}
