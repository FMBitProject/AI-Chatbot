import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const { id: userId, companyId } = guard.user;

  const { id } = await params;

  // chat_sessions/chat_messages are RLS-protected: verify session ownership and
  // read its messages in one tenant-scoped transaction. RLS also guarantees a
  // session/message from another company is invisible even if the id matches.
  const messages = await withTenant(companyId, async (tx) => {
    const [chatSession] = await tx.select().from(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
      .limit(1);
    if (!chatSession) return null;
    return tx.select().from(chatMessages).where(eq(chatMessages.sessionId, id));
  });

  if (messages === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(messages);
}
