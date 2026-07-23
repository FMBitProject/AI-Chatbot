import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
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
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = dbUser.companyId;

  // chat_sessions/chat_messages are RLS-protected: verify session ownership and
  // read its messages in one tenant-scoped transaction. RLS also guarantees a
  // session/message from another company is invisible even if the id matches.
  const messages = await withTenant(companyId, async (tx) => {
    const [chatSession] = await tx.select().from(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, dbUser.id)))
      .limit(1);
    if (!chatSession) return null;
    return tx.select().from(chatMessages).where(eq(chatMessages.sessionId, id));
  });

  if (messages === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(messages);
}
