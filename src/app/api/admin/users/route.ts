import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { isUnderLimit } from "@/lib/plan-limits";
import { resolvePlanById } from "@/lib/subscription";
import { isPasswordValid } from "@/lib/password";
import { LIMITS, optionalString, readJsonObject } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Named columns rather than select(). The row carries fields the employee list
  // has no use for, and one of them is a credential: `two_factor_secret`. It is
  // unwritten today (better-auth's twoFactor plugin keeps its own table), which
  // is exactly why a `select()` here is a trap — the day anything populates that
  // column, this endpoint starts shipping every employee's TOTP seed to the
  // admin's browser, and nothing about the code would change to say so.
  const employees = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    emailVerified: users.emailVerified,
    role: users.role,
    department: users.department,
    twoFactorEnabled: users.twoFactorEnabled,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.companyId, dbUser.companyId));
  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Enforce the limits of the plan that is in force right now (see resolvePlan).
  const { subscription, limits } = await resolvePlanById(dbUser.companyId);
  const [{ count: empCount }] = await db.select({ count: count() }).from(users).where(eq(users.companyId, dbUser.companyId));
  if (!isUnderLimit(empCount, limits.maxEmployees)) {
    return NextResponse.json({
      error: `Batas karyawan paket ${subscription.plan} sudah tercapai (${limits.maxEmployees} karyawan). Upgrade paket untuk menambah lebih banyak.`,
    }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });

  const name = optionalString(body.name, LIMITS.name);
  const email = optionalString(body.email, LIMITS.email)?.toLowerCase();
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

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
  }

  try {
    await auth.api.signUpEmail({ body: { name, email, password } });
  } catch {
    // signUpEmail may throw if email sending fails — check if user was created anyway
  }

  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!created) {
    return NextResponse.json({ error: "Email tidak valid atau tidak dapat digunakan." }, { status: 400 });
  }

  // Only adopt an account that belongs to nobody yet. signUpEmail is allowed to
  // throw (mail failure) and we look the address up again afterwards to see
  // whether the account was created regardless — but "an account with this
  // address exists" is not the same claim as "we just created it". Someone
  // registering their own company at /register with the same address in the
  // window between the check above and this read would be found here, and the
  // update below would move them into this admin's company as an employee.
  // Narrow, but the failure is an account takeover, so it is guarded rather
  // than reasoned about.
  if (created.companyId) {
    return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
  }

  await db.update(users)
    .set({ companyId: dbUser.companyId, role: "employee", department: department || null, emailVerified: true })
    .where(eq(users.id, created.id));

  const [updated] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
  return NextResponse.json(updated);
}
