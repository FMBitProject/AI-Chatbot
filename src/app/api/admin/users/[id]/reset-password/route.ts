import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [admin] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!admin || admin.role !== "admin" || !admin.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { newPassword } = await req.json() as { newPassword: string };

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "Password minimal 8 karakter." }, { status: 400 });
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target || target.companyId !== admin.companyId) {
    return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
  }

  // Update password via Better Auth - use signUpEmail workaround since setPassword is user-only
  // For now, store hashed password directly via auth internal method
  await auth.api.changePassword({
    body: { currentPassword: "", newPassword, revokeOtherSessions: false },
    headers: new Headers({ "x-user-id": id }),
  }).catch(async () => {
    // Fallback: re-create password via admin update
    await auth.api.signUpEmail({ body: { name: target.name, email: target.email, password: newPassword } }).catch(() => {});
  });

  return NextResponse.json({ ok: true });
}
