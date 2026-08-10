import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { chatSessions, chatMessages, documents, users } from "@/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  // documents, chat_sessions and chat_messages are all RLS-protected, so their
  // reads share one tenant-scoped transaction. users is not RLS'd and stays on
  // the plain connection below.
  const { totalSessions, totalMessages, totalDocs, recentSessions } = await withTenant(companyId, async (tx) => {
    const [totalSessions] = await tx.select({ count: count() }).from(chatSessions)
      .where(eq(chatSessions.companyId, companyId));
    const [totalMessages] = await tx.select({ count: count() }).from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(eq(chatSessions.companyId, companyId));
    const [totalDocs] = await tx.select({ count: count() }).from(documents)
      .where(eq(documents.companyId, companyId));
    const recentSessions = await tx.select({ title: chatSessions.title, createdAt: chatSessions.createdAt })
      .from(chatSessions)
      .where(eq(chatSessions.companyId, companyId))
      .orderBy(desc(chatSessions.createdAt))
      .limit(10);
    return { totalSessions, totalMessages, totalDocs, recentSessions };
  });

  const [totalEmployees] = await db.select({ count: count() }).from(users)
    .where(eq(users.companyId, companyId));

  return NextResponse.json({
    totalSessions: totalSessions.count,
    totalMessages: totalMessages.count,
    totalDocuments: totalDocs.count,
    totalEmployees: totalEmployees.count,
    recentQuestions: recentSessions,
  });
}
