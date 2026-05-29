import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [chatSession] = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, dbUser.id)))
    .limit(1);
  if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, id));

  return NextResponse.json(messages);
}
