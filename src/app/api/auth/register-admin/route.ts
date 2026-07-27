import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, companies, sessions, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";

// Public endpoint that creates a company + admin — throttle per IP so it can't
// be used for mass signup spam.
const REGISTER_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

// Undoes a signup that failed partway. better-auth may or may not have created
// the user by the time it threw, so both halves are cleaned up defensively.
async function rollback(companyId: string, email: string) {
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.delete(accounts).where(eq(accounts.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
    await db.delete(companies).where(eq(companies.id, companyId));
  } catch (cleanupError) {
    console.error("[register-admin] rollback failed:", cleanupError);
  }
}

export async function POST(req: NextRequest) {
  const limit = consumeRateLimit(`register-admin:${getClientIp(req)}`, REGISTER_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan pendaftaran. Coba lagi beberapa menit lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { name, email, password, companyName } = await req.json() as {
      name: string;
      email: string;
      password: string;
      companyName: string;
    };

    if (!name || !email || !password || !companyName) {
      return NextResponse.json({ error: "Semua field wajib diisi." }, { status: 400 });
    }

    // better-auth only enforces a length minimum, so the strength rules the
    // form shows have to be repeated here — otherwise a direct POST creates an
    // account with a password the UI would have rejected.
    if (!isPasswordValid(password)) {
      return NextResponse.json({
        error: "Password minimal 8 karakter dan harus memuat huruf besar, angka, dan karakter spesial.",
      }, { status: 400 });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
    }

    const existingCompany = await db.select().from(companies).where(eq(companies.name, companyName)).limit(1);
    if (existingCompany.length > 0) {
      return NextResponse.json({ error: "Nama perusahaan sudah terdaftar." }, { status: 409 });
    }

    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: companyName });

    try {
      await auth.api.signUpEmail({
        body: { name, email, password, callbackURL: "/admin" },
      });
    } catch (signUpError) {
      // Signing up sends the verification mail, and login is blocked until it is
      // clicked — so a mail failure here means the account can never be used.
      // Roll the half-made signup back rather than leaving the company name and
      // email taken, which would stop the person retrying once mail works again.
      await rollback(companyId, email);
      console.error("[register-admin] signup failed, rolled back:", signUpError);
      return NextResponse.json({
        error: "Pendaftaran gagal saat mengirim email verifikasi. Silakan coba lagi beberapa saat lagi.",
      }, { status: 502 });
    }

    const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (created) {
      await db.update(users)
        .set({ companyId, role: "admin" })
        .where(eq(users.id, created.id));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[register-admin]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
