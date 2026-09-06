import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { withTenant } from "@/lib/db/tenant";
import { chatMessages, chatSessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { isOneOf, optionalString, readJsonObject } from "@/lib/validate";

export async function POST(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;
  const { id: userId, companyId } = guard.user;

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
  // this user and update it inside one tenant-scoped transaction. The
  // companyId predicate below is defence-in-depth on top of the row policy.
  //
  // userId is the predicate that actually authorises: the company check is
  // what RLS already enforces, so without this a colleague's answer could be
  // rated by anyone in the workspace holding its message id. Nothing is
  // disclosed by that — the response is the same 200 either way — but the
  // satisfaction figures on the admin dashboard stop being the judgement of
  // the people who asked the questions, which is the only thing they are for.
  const updated = await withTenant(companyId, async (tx) => {
    const [msg] = await tx
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(and(
        eq(chatMessages.id, messageId),
        eq(chatSessions.userId, userId),
        eq(chatSessions.companyId, companyId),
      ))
      .limit(1);
    if (!msg) return false;
    await tx.update(chatMessages).set({ feedback }).where(eq(chatMessages.id, messageId));
    return true;
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
