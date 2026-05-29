import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
  await db.delete(documents).where(
    and(eq(documents.id, id), eq(documents.companyId, dbUser.companyId))
  );

  return NextResponse.json({ ok: true });
}
