import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, companies, sessions, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";
import { isOneOf, LIMITS, optionalEmail, optionalString, readJsonObject } from "@/lib/validate";

// Public endpoint that creates a workspace + its admin — throttle per IP so it
// can't be used for mass signup spam.
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
    // Validated, not cast. This is a public, unauthenticated endpoint that
    // writes two rows, so the body is as untrusted as the one on /api/v1/query.
    // The old `as { name: string; ... }` was erased at runtime: `name` could
    // arrive as an object and reach `companies.name`, and every field was
    // unbounded — a megabyte-long companyName was stored verbatim, and the
    // truthiness check below was the only thing standing in for validation.
    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
    }

    const name = optionalString(body.name, LIMITS.name);
    const email = optionalEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    // Absent means "company": this endpoint predates individual accounts, and an
    // old client (a cached tab mid-signup during a deploy) must keep creating
    // the thing it thinks it is creating. Anything present but unrecognised is
    // rejected rather than defaulted — a typo'd account type is a signup the
    // person meant differently, and it is written to a row nothing later changes.
    const accountType = body.accountType === undefined
      ? "company"
      : isOneOf(body.accountType, ["company", "individual"] as const)
        ? body.accountType
        : null;
    if (!accountType) {
      return NextResponse.json({ error: "Jenis akun tidak valid." }, { status: 400 });
    }

    // An individual's workspace is named after the person, so the form has no
    // company field to fill in and the request carries none. Taking the name
    // from the account holder rather than asking twice also means the two can
    // never disagree.
    const companyName = accountType === "individual"
      ? name
      : optionalString(body.companyName, LIMITS.name);

    if (!name || !email || !password || !companyName) {
      return NextResponse.json({ error: "Semua field wajib diisi." }, { status: 400 });
    }

    // better-auth only enforces a length minimum, so the strength rules the
    // form shows have to be repeated here — otherwise a direct POST creates an
    // account with a password the UI would have rejected. The upper bound is
    // ours: scrypt hashes whatever it is handed, so an unbounded password is a
    // CPU bill payable by anyone who can reach this route.
    if (password.length > LIMITS.password || !isPasswordValid(password)) {
      return NextResponse.json({
        error: "Password minimal 8 karakter dan harus memuat huruf besar, angka, dan karakter spesial.",
      }, { status: 400 });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email sudah terdaftar." }, { status: 409 });
    }

    // Organisations only. Two clinics genuinely cannot share a name here — the
    // name is how their people recognise the workspace they are being added to —
    // but two *people* can, and very often do. Running this check for an
    // individual would turn a common name into "already registered", on a form
    // with no field the person could change to get past it. The database agrees:
    // the unique index added in 0016 is predicated on account_type = 'company'.
    if (accountType === "company") {
      const existingCompany = await db.select().from(companies).where(eq(companies.name, companyName)).limit(1);
      if (existingCompany.length > 0) {
        return NextResponse.json({ error: "Nama perusahaan sudah terdaftar." }, { status: 409 });
      }
    }

    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: companyName, accountType });

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
      // "admin" for an individual too. The role says who owns the workspace, not
      // how many people are in it: uploading documents, setting the persona and
      // paying for the plan all sit behind requireAdmin, and they are the whole
      // of what an individual account does. What an admin may do to *other*
      // people is gated separately, by requireCompanyAdmin.
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
