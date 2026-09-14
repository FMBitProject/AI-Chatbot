import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq, and, or, ilike } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { pagination, paginated } from "@/lib/pagination";
import { withApiErrors } from "@/lib/api-error";

export const GET = withApiErrors("admin/audit", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;
  const search = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (search.length > 200) throw new ValidationError("Search is too long");
  const page = pagination(req, [
    { column: chatMessages.createdAt, direction: "desc" },
    { column: chatMessages.role, direction: "asc" },
    { column: chatMessages.id, direction: "desc" },
  ], `${new URL(req.url).pathname}:${search}`);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;

  // chat_messages/chat_sessions are RLS-protected; the join (incl. non-RLS users)
  // runs inside a tenant-scoped transaction.
  const logs = await withTenant(companyId, (tx) => tx
    .select({
      _cursor: page.selection,
      sessionId: chatSessions.id,
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
    .where(and(eq(chatSessions.companyId, companyId), page.condition,
      search ? or(ilike(chatMessages.content, pattern), ilike(users.name, pattern)) : undefined))
    .orderBy(...page.order).limit(page.limit + 1));

  return paginated(logs, page);
});
