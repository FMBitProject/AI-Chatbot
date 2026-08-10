import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { chatSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const { id: userId, companyId } = guard.user;

  const sessions = await withTenant(companyId, (tx) => tx
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), eq(chatSessions.companyId, companyId))));

  return NextResponse.json(sessions);
}
