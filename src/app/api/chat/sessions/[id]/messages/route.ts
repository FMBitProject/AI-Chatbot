import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions } from "@/lib/db/schema";
import { eq, and, getTableColumns } from "drizzle-orm";
import { pagination, paginated } from "@/lib/pagination";
import { withApiErrors } from "@/lib/api-error";

export const GET = withApiErrors("chat/messages", async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const { id: userId, companyId } = guard.user;

  const { id } = await params;
  const page = pagination(req, [
    { column: chatMessages.createdAt, direction: "asc" },
    { column: chatMessages.role, direction: "desc" },
    { column: chatMessages.id, direction: "asc" },
  ]);

  // chat_sessions/chat_messages are RLS-protected: verify session ownership and
  // read its messages in one tenant-scoped transaction. RLS also guarantees a
  // session/message from another company is invisible even if the id matches.
  const messages = await withTenant(companyId, async (tx) => {
    const [chatSession] = await tx.select().from(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
      .limit(1);
    if (!chatSession) return null;
    return tx.select({ ...getTableColumns(chatMessages), _cursor: page.selection }).from(chatMessages)
      .where(and(eq(chatMessages.sessionId, id), page.condition))
      // A question and constant reply can share a transaction timestamp.
      .orderBy(...page.order).limit(page.limit + 1);
  });

  if (messages === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return paginated(messages, page);
});
