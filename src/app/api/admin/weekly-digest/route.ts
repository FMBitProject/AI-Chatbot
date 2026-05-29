import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatSessions, chatMessages, documents, users, companies } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { sendWeeklyDigest } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalSessions] = await db.select({ count: count() }).from(chatSessions)
    .where(eq(chatSessions.companyId, dbUser.companyId));

  const recentSessions = await db.select({ title: chatSessions.title })
    .from(chatSessions)
    .where(eq(chatSessions.companyId, dbUser.companyId))
    .limit(5);

  const [totalDocs] = await db.select({ count: count() }).from(documents)
    .where(eq(documents.companyId, dbUser.companyId));

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  const admins = await db.select({ email: users.email }).from(users)
    .where(eq(users.companyId, dbUser.companyId))
    .then((rows) => rows.filter(() => true)); // sent to all company users; filter by role if needed

  await sendWeeklyDigest({
    to: admins.map((a) => a.email),
    companyName: company?.name ?? "Perusahaan",
    totalChats: totalSessions.count,
    topQuestions: recentSessions.map((s) => s.title),
    totalDocuments: totalDocs.count,
    appUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });

  return NextResponse.json({ ok: true });
}
