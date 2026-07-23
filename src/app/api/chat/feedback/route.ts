import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = dbUser.companyId;

  const { messageId, feedback } = await req.json() as { messageId: string; feedback: "up" | "down" };

  // chat_messages/chat_sessions are RLS-protected: verify the message belongs to
  // this company and update it inside one tenant-scoped transaction. The
  // companyId predicate below is defence-in-depth on top of the row policy.
  const updated = await withTenant(companyId, async (tx) => {
    const [msg] = await tx
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(eq(chatMessages.id, messageId), eq(chatSessions.companyId, companyId)))
      .limit(1);
    if (!msg) return false;
    await tx.update(chatMessages).set({ feedback }).where(eq(chatMessages.id, messageId));
    return true;
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
