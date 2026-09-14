import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { chatSessions } from "@/lib/db/schema";
import { eq, and, getTableColumns } from "drizzle-orm";
import { pagination, paginated } from "@/lib/pagination";
import { withApiErrors } from "@/lib/api-error";

export const GET = withApiErrors("chat/sessions", async (req: NextRequest) => {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const { id: userId, companyId } = guard.user;
  const page = pagination(req, [{ column: chatSessions.createdAt, direction: "asc" }, { column: chatSessions.id, direction: "asc" }]);

  const sessions = await withTenant(companyId, (tx) => tx
    .select({ ...getTableColumns(chatSessions), _cursor: page.selection })
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), eq(chatSessions.companyId, companyId), page.condition))
    .orderBy(...page.order).limit(page.limit + 1));

  return paginated(sessions, page);
});
