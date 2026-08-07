import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { documents, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = dbUser.companyId;
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
