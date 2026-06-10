import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { messageId, feedback } = await req.json() as { messageId: string; feedback: "up" | "down" };

  // Verify the message belongs to this company before updating
  const [msg] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(and(eq(chatMessages.id, messageId), eq(chatSessions.companyId, dbUser.companyId)))
    .limit(1);

  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(chatMessages).set({ feedback }).where(eq(chatMessages.id, messageId));
  return NextResponse.json({ ok: true });
}
