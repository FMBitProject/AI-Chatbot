import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = dbUser.companyId;

  // chat_messages/chat_sessions are RLS-protected; the join (incl. non-RLS users)
  // runs inside a tenant-scoped transaction.
  const logs = await withTenant(companyId, (tx) => tx
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
      feedback: chatMessages.feedback,
      sessionTitle: chatSessions.title,
      userName: users.name,
      userEmail: users.email,
    })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .innerJoin(users, eq(chatSessions.userId, users.id))
    .where(eq(chatSessions.companyId, companyId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(200));

  return NextResponse.json(logs);
}
