import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";

// Deliberately readable by any member of the company, not just admins — unlike
// every other GET under /api/admin. The chat UI renders `aiName` and
// `aiGreeting` to employees, so this is company branding rather than company
// data, and requiring the admin role would only mean employees see an unnamed
// assistant. The PATCH below is admin-only, which is where it matters.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser?.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [company] = await db.select().from(companies).where(eq(companies.id, dbUser.companyId)).limit(1);
  return NextResponse.json({ aiName: company?.aiName, aiGreeting: company?.aiGreeting, aiPersonality: company?.aiPersonality });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  // Bounded because all three are concatenated into the system prompt of every
  // question this company asks, forever (see systemPromptWithContext in
  // /api/chat). An unbounded `aiPersonality` is a permanent per-question token
  // cost that nothing else in the request can offset — and it is the one field
  // here whose content the model is asked to obey.
  //
  // "Absent" and "empty" both mean "clear it", which is the behaviour the form
  // has always had: it posts all three fields on every save and an emptied
  // textarea arrives as "". Only over-length is an error, so it is the only
  // thing that gets rejected.
  const clear = (v: unknown): string | null | undefined => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return trimmed.length > LIMITS.persona ? undefined : trimmed;
  };

  const aiName = optionalString(body.aiName, LIMITS.name);
  const aiGreeting = clear(body.aiGreeting);
  const aiPersonality = clear(body.aiPersonality);

  if (aiGreeting === undefined || aiPersonality === undefined) {
    return NextResponse.json({
      error: `Sapaan dan kepribadian AI maksimal ${LIMITS.persona} karakter.`,
    }, { status: 400 });
  }

  await db.update(companies)
    .set({ aiName: aiName || "IntelliBase AI", aiGreeting, aiPersonality })
    .where(eq(companies.id, dbUser.companyId));

  return NextResponse.json({ ok: true });
}
