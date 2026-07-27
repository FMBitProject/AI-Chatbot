import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";

// Keyed by user id: stops a hijacked session from brute-forcing currentPassword.
const CHANGE_PASSWORD_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = consumeRateLimit(`change-password:${session.user.id}`, CHANGE_PASSWORD_LIMIT);
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
