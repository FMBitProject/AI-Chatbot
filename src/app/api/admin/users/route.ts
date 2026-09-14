import { NextRequest, NextResponse } from "next/server";
import { createCredentialAccount, isUniqueConflict, SeatLimitError } from "@/lib/credential-account";
import { requireAdmin, requireCompanyAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { pagination, paginated } from "@/lib/pagination";
import { withApiErrors } from "@/lib/api-error";
import { isPasswordValid } from "@/lib/password";
import { LIMITS, optionalEmail, optionalString, readJsonObject } from "@/lib/validate";

export const GET = withApiErrors("admin/users/list", async (req: NextRequest) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;
  const page = pagination(req, [{ column: users.createdAt, direction: "asc" }, { column: users.id, direction: "asc" }]);

  // Named columns rather than select(). The row carries fields the employee list
  // has no use for, and one of them is a credential: `two_factor_secret`. It is
  // unwritten today (better-auth's twoFactor plugin keeps its own table), which
  // is exactly why a `select()` here is a trap — the day anything populates that
  // column, this endpoint starts shipping every employee's TOTP seed to the
  // admin's browser, and nothing about the code would change to say so.
  const employees = await db.select({
    _cursor: page.selection,
    id: users.id,
    name: users.name,
    email: users.email,
    emailVerified: users.emailVerified,
    role: users.role,
    department: users.department,
    twoFactorEnabled: users.twoFactorEnabled,
    createdAt: users.createdAt,
  }).from(users).where(and(eq(users.companyId, companyId), page.condition))
    .orderBy(...page.order).limit(page.limit + 1);
  return paginated(employees, page);
});

export const POST = withApiErrors("admin/users/create", async (req: NextRequest) => {
  // Company admins only. An individual workspace has exactly one member and its
  // plan sells exactly one seat, so a second account created here would be a
  // person the plan was never priced for — and the dashboard, which hides this
  // tab for individuals, is not where that gets decided.
  //
  // GET above stays on requireAdmin: it lists the workspace's own members, which
  // for an individual is the one person asking. Nothing is disclosed and nothing
  // is spent, so there is no reason to refuse it.
  const guard = await requireCompanyAdmin(req);
  if (!guard.ok) return guard.response;
  const { companyId } = guard.user;

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  const name = optionalString(body.name, LIMITS.name);
  const email = optionalEmail(body.email)?.toLowerCase();
  const department = optionalString(body.department, LIMITS.name);
  const password = body.password;

  if (!name || !email) {
    return NextResponse.json({ error: "Nama dan email wajib diisi." }, { status: 400 });
  }

  // The same rule the dialog enforces (isPasswordValid), not a length-only
  // check. This was the one password-setting path in the app that trusted the
  // browser: register-admin, change-password and the admin reset endpoint all
  // repeat the strength rules server-side, and this one did not — so a direct
  // POST here created an employee account with a password the UI would have
  // refused, on an account that can read the company's entire knowledge base.
  //
  // The typeof check is not a formality either. `password.length` on an absent
  // field throws, and the TypeError escapes as a 500 — a malformed request
  // reported as our own failure.
  if (typeof password !== "string" || password.length > LIMITS.password || !isPasswordValid(password)) {
    return NextResponse.json({
      error: "Password minimal 8 karakter dan harus memuat huruf besar, angka, dan karakter khusus.",
    }, { status: 400 });
  }

  try {
    const created = await createCredentialAccount({
      name, email, password, companyId, role: "employee",
      department, emailVerified: true,
    });
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof SeatLimitError) {
      return NextResponse.json({ error: "Batas karyawan sudah tercapai." }, { status: 403 });
    }
    if (isUniqueConflict(error)) {
      return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
    }
    console.error("[admin/users] create failed:", error);
    return NextResponse.json({ error: "Gagal membuat akun. Silakan coba lagi." }, { status: 503 });
  }
});
