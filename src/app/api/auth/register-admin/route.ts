import { NextRequest, NextResponse } from "next/server";
import { createCredentialAccount, isUniqueConflict } from "@/lib/credential-account";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { isPasswordValid } from "@/lib/password";
import { isOneOf, LIMITS, optionalEmail, optionalString, readJsonObject } from "@/lib/validate";

// Public endpoint that creates a workspace + its admin — throttle per IP so it
// can't be used for mass signup spam.
const REGISTER_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(`register-admin:${getClientIp(req)}`, REGISTER_LIMIT);
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
    const email = optionalEmail(body.email)?.toLowerCase();
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

    const companyId = randomUUID();
    await createCredentialAccount({
      name, email, password, companyId, role: "admin",
      workspace: { name: companyName, accountType },
    });

    // Provisioning is committed before email delivery. A delivery failure must
    // never delete an account; the login page offers verification resend.
    let verificationEmailSent = true;
    try {
      await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/admin" } });
    } catch (error) {
      verificationEmailSent = false;
      console.error("[register-admin] verification delivery failed:", error);
    }
    return NextResponse.json({ ok: true, verificationEmailSent });
  } catch (error) {
    if (isUniqueConflict(error)) {
      return NextResponse.json({ error: "Email atau nama perusahaan sudah terdaftar." }, { status: 409 });
    }
    console.error("[register-admin]", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
