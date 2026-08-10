import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";

// requireUser, not requireAdmin — deliberately readable by any member of the
// company, unlike every other GET under /api/admin. The chat UI renders
// `aiName` and `aiGreeting` to employees, so this is company branding rather
// than company data, and requiring the admin role would only mean employees see
// an unnamed assistant. The PATCH below is admin-only, which is where it
// matters. (The asymmetry used to be visible only by diffing two near-identical
// blocks of boilerplate; now it is the name of the function being called.)
export async function GET(req: NextRequest) {
  const guard = await requireUser(req);
  if (!guard.ok) return guard.response;

  const [company] = await db.select().from(companies).where(eq(companies.id, guard.user.companyId)).limit(1);
  return NextResponse.json({ aiName: company?.aiName, aiGreeting: company?.aiGreeting, aiPersonality: company?.aiPersonality });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

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
    .where(eq(companies.id, companyId));

  return NextResponse.json({ ok: true });
}
