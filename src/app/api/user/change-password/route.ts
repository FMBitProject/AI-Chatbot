import { NextRequest, NextResponse } from "next/server";
// `auth` is still imported for changePassword below — the guard covers the
// session check only, not the rest of better-auth's API.
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-guard";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";

// Keyed by user id: stops a hijacked session from brute-forcing currentPassword.
const CHANGE_PASSWORD_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: NextRequest) {
  // requireSession, the loosest guard: changing your own password touches no
  // company-scoped data and needs no role, so requireUser's companyId
  // requirement would only lock out a user not yet assigned to a company —
  // someone who can still sign in, and whose password is still theirs to change.
  // The current password is verified below on top of this.
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;

  const limit = consumeRateLimit(`change-password:${guard.userId}`, CHANGE_PASSWORD_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const { currentPassword, newPassword } = await req.json() as {
    currentPassword: string;
    newPassword: string;
  };

  if (!isPasswordValid(newPassword ?? "")) {
    return NextResponse.json({
      error: "Password baru minimal 8 karakter dan harus memuat huruf besar, angka, dan karakter spesial.",
    }, { status: 400 });
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: req.headers,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Password lama tidak sesuai." }, { status: 400 });
  }
}
