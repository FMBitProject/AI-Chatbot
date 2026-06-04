import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatSessions, chatMessages, documents, users } from "@/lib/db/schema";
import { eq, count, desc, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalSessions] = await db.select({ count: count() }).from(chatSessions)
    .where(eq(chatSessions.companyId, dbUser.companyId));

  const [totalMessages] = await db.select({ count: count() }).from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(eq(chatSessions.companyId, dbUser.companyId));

  const [totalDocs] = await db.select({ count: count() }).from(documents)
    .where(eq(documents.companyId, dbUser.companyId));

  const [totalEmployees] = await db.select({ count: count() }).from(users)
    .where(eq(users.companyId, dbUser.companyId));

  const recentSessions = await db.select({ title: chatSessions.title, createdAt: chatSessions.createdAt })
    .from(chatSessions)
    .where(eq(chatSessions.companyId, dbUser.companyId))
    .orderBy(desc(chatSessions.createdAt))
    .limit(10);

  const feedbackUp = await db.select({ count: count() }).from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(and(eq(chatSessions.companyId, dbUser.companyId), eq(chatMessages.feedback, "up")));

  return NextResponse.json({
    totalSessions: totalSessions.count,
    totalMessages: totalMessages.count,
    totalDocuments: totalDocs.count,
    totalEmployees: totalEmployees.count,
    recentQuestions: recentSessions,
  });
}
