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

  // Better Auth has no admin "set password for another user" endpoint, so use
  // its internal context: hash with the same scrypt config logins verify
  // against, and update the credential account row directly.
  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(target.id);
  if (!accounts.some((a) => a.providerId === "credential")) {
    return NextResponse.json({ error: "User ini tidak memiliki login password." }, { status: 400 });
  }

  const hashed = await ctx.password.hash(newPassword);
  await ctx.internalAdapter.updatePassword(target.id, hashed);

  // The old password may be compromised (that's why it's being reset) — force
  // the user to sign in again everywhere.
  const sessions = await ctx.internalAdapter.listSessions(target.id);
  if (sessions.length > 0) {
    await ctx.internalAdapter.deleteSessions(sessions.map((s) => s.token));
  }

  return NextResponse.json({ ok: true });
}
