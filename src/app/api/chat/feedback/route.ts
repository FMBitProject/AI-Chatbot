import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { isOneOf, optionalString, readJsonObject } from "@/lib/validate";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || !dbUser.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = dbUser.companyId;

  // `as { feedback: "up" | "down" }` was a claim about the body, not a check on
  // it: the cast is erased at runtime, so any string at all reached the UPDATE
  // and landed in a column the admin dashboard reads back as a rating. The
  // column has no CHECK constraint behind it either, so this is the only place
  // the two allowed values are actually enforced.
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  const messageId = optionalString(body.messageId, 128);
  const feedback = body.feedback;
  if (!messageId || !isOneOf(feedback, ["up", "down"] as const)) {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

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
