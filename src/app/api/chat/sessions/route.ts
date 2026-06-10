import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatSessions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sessions = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, dbUser.id), eq(chatSessions.companyId, dbUser.companyId!)));

  return NextResponse.json(sessions);
}
