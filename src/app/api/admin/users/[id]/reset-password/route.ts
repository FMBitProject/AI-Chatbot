import { NextRequest, NextResponse } from "next/server";
// `auth` is still imported for auth.$context below — the guard covers the
// session check only, not the rest of better-auth's API.
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "@/lib/mail";
import { authEmail, escapeHtml } from "@/lib/email-template";
import { isPasswordValid } from "@/lib/password";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const admin = guard.user;

  const { id } = await params;
  const body = await req.json().catch(() => null) as { newPassword?: unknown } | null;
  const newPassword = body?.newPassword;

  // The same rule the dialog enforces (isPasswordValid), not a laxer length-only
  // check. A caller reaching this endpoint directly could otherwise set a weaker
  // password than the UI would ever accept — and this endpoint is how a
  // compromised password gets replaced, so it is the last place to be lenient.
  if (typeof newPassword !== "string" || !isPasswordValid(newPassword)) {
    return NextResponse.json({
      error: "Password minimal 8 karakter dan harus memuat huruf besar, angka, dan karakter khusus.",
    }, { status: 400 });
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target || target.companyId !== admin.companyId) {
    return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
  }

  // Resetting yourself here would delete your own sessions mid-request and sign
  // you straight out, then mail you a notice naming yourself as the person who
  // did it. Changing your own password is what /api/user/change-password is for,
  // and it asks for the current one first.
  if (target.id === admin.id) {
    return NextResponse.json({
      error: "Gunakan menu Ganti Password untuk mengubah kata sandi Anda sendiri.",
    }, { status: 400 });
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

  // Tell the employee their password changed. Not a verification step — the
  // reset is already done and this carries no link to click. It exists so the
  // change cannot happen silently: a hijacked admin account could otherwise
  // reset every employee in the company and lock them all out with nothing
  // reaching the people it happened to. Being signed out with no explanation
  // looks identical to an outage from the employee's side.
  //
  // Deliberately after the reset, and deliberately not fatal: the password has
  // already changed by this point, so failing the request over an undelivered
  // notice would tell the admin their reset failed when it did not. Report
  // whether it went out instead, so they know to pass the password on by hand.
  let notified = false;
  // Escaped here rather than by authEmail: it lands inside `body`, which the
  // template treats as trusted copy we wrote ourselves.
  const adminName = escapeHtml(admin.name);
  try {
    await sendMail({
      to: target.email,
      subject: "Your password was reset / Kata sandi Anda telah diatur ulang — IntelliBase AI",
      html: authEmail({
        heading: { en: "Your password was reset", id: "Kata Sandi Anda Telah Diatur Ulang" },
        greetingName: target.name,
        body: {
          en: `An administrator of your company (${adminName}) has just reset the password for your IntelliBase AI account, and you have been signed out on every device. Ask them for your new password to sign back in. If you did not expect this, contact them straight away.`,
          id: `Administrator perusahaan Anda (${adminName}) baru saja mengatur ulang kata sandi akun IntelliBase AI Anda, dan Anda telah dikeluarkan dari semua perangkat. Mintalah kata sandi baru kepada beliau untuk masuk kembali. Jika Anda tidak menduga hal ini terjadi, segera hubungi beliau.`,
        },
        note: {
          en: "This email is a notification only — there is nothing to click and no action is needed here. We never send your password by email.",
          id: "Email ini hanya pemberitahuan — tidak ada yang perlu diklik dan tidak ada tindakan yang diperlukan di sini. Kami tidak pernah mengirim kata sandi Anda melalui email.",
        },
      }),
    });
    notified = true;
  } catch (error) {
    console.error(`[reset-password] password reset for ${target.email} succeeded but the notification email did not:`, error);
  }

  return NextResponse.json({ ok: true, notified });
}
