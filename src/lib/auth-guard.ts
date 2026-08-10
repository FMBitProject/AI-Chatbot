import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * The authorization check every authenticated route starts with.
 *
 * Three entry points, in ascending strictness:
 *
 *   requireSession — signed in. Nothing more.
 *   requireUser    — signed in, and belongs to a company.
 *   requireAdmin   — signed in, belongs to a company, and is its admin.
 *
 * Nothing outside this file may call `auth.api.getSession` to authenticate a
 * request; an ESLint rule in eslint.config.mjs enforces that for route handlers,
 * so the pattern is checked rather than merely documented.
 *
 * Next's own authentication guide recommends this consolidation (it calls the
 * result a Data Access Layer) and is explicit that proxy-level checks are not a
 * substitute: "the majority of security checks should be performed as close as
 * possible to your data source".
 *
 * Our proxy (src/proxy.ts) is precisely the "optimistic check" that guide warns
 * about relying on. It does maintenance mode, per-IP rate limiting, and one
 * auth-adjacent thing: if the better-auth session *cookie* is absent it
 * redirects /chat and /admin to /login. That is a redirect for page routes based
 * on a cookie being present — it never validates the token, never reads the
 * role, and never runs on /api/* at all. So for every route under /api this file
 * is the first real line of defence, with Postgres RLS (see @/lib/db/tenant) as
 * the second.
 *
 * The result is a discriminated union rather than a thrown error, because a
 * throw would need every handler wrapped in a try/catch to become a response,
 * and an unwrapped one degrades to a 500 — which is to say, it fails open on the
 * status code. The union makes TypeScript do the enforcing instead:
 *
 *     const guard = await requireAdmin(req);
 *     if (!guard.ok) return guard.response;
 *     const { companyId } = guard.user;   // `string`, not `string | null`
 *
 * Skip the `if` and there is nothing to destructure `guard.user` from — the
 * check is not a convention to remember, it is the only way to reach the user.
 */

// What the guards read, and therefore the most a caller can ever get. An
// explicit allowlist rather than the whole row: `select()` would mean any column
// added to `users` later flows out of here by default, into every route, and
// from there into whatever a route happens to serialize. That is not a
// hypothetical in this codebase — see the note on twoFactorSecret in
// @/lib/db/schema for the credential column that reached the admin's browser
// exactly that way.
//
// `createdAt` and `role` are here because isSeatActive needs them; `name` and
// `email` because checkout sends them to Midtrans and the reset-password mail
// names the admin who acted. Nothing is here "just in case" — add a field when a
// caller needs it, so this list keeps saying what the guards actually expose.
interface UserRow {
  id: string;
  companyId: string | null;
  role: "admin" | "employee";
  name: string;
  email: string;
  department: string | null;
  createdAt: Date;
}

// The same row once `companyId` is known to be present, which is what every
// tenant-scoped caller needs and what retires the `dbUser.companyId!`
// assertions the old inline copies were full of.
export type AuthedUser = Omit<UserRow, "companyId"> & { companyId: string };

export type Guard =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

export type SessionGuard =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export interface GuardOptions {
  /** Body message for the 401. Defaults to "Unauthorized". */
  unauthorized?: string;
  /** Body message for the 403. Defaults to "Forbidden". */
  forbidden?: string;
}

const SELECTED = {
  id: users.id,
  companyId: users.companyId,
  role: users.role,
  name: users.name,
  email: users.email,
  department: users.department,
  createdAt: users.createdAt,
};

// Only the status codes are load-bearing for the UI — the admin dashboard
// redirects on 401 vs 403 (src/app/admin/page.tsx) and the chat page branches on
// the `error` *code* for SEAT_FROZEN, never on this prose. Two routes still pass
// their own text because theirs is rendered to the user verbatim: the payment
// verify toast shows `error` as its description.
function deny(status: 401 | 403, message: string) {
  return { ok: false as const, response: NextResponse.json({ error: message }, { status }) };
}

/**
 * A refusal aimed at whoever is signed in, logged because it is a signal.
 *
 * A 401 means an anonymous caller hit a private URL, which happens constantly
 * (expired cookies, prefetches, bots) and is not worth a line. A 403 is
 * different: someone who *is* authenticated asked for something that is not
 * theirs. One is a mistake; a stream of them across the admin endpoints is
 * somebody trying doors. Nothing recorded it before this.
 *
 * `reason` separates the two ways to earn a 403 — no company at all versus the
 * wrong role — because they need different responses. The second is a probe. The
 * first is an account whose provisioning did not finish, and the person is stuck
 * with no way to tell us.
 */
function denyAuthed(
  req: Request,
  reason: "no-company" | "not-admin",
  userId: string,
  message: string,
) {
  let path = "unknown";
  try {
    path = new URL(req.url).pathname;
  } catch {
    // A malformed URL must not turn a clean 403 into a 500. The log line is
    // worth less without the path; the refusal is worth the same.
  }
  console.warn(`[auth-guard] 403 ${reason} user=${userId} path=${path}`);
  return deny(403, message);
}

/**
 * Postgres unreachable, connection pool exhausted, better-auth throwing — none
 * of which is the caller's fault, and none of which is a 500.
 *
 * Unhandled, these surface as an opaque server error with a stack trace, which
 * reads as "the app is broken" for what is usually a transient database blip.
 * 503 says the same thing the retry advice does. This is the payoff for having
 * one guard instead of twenty-three copies: it is fixed in one place.
 *
 * Note for /api/chat: the chat page already branches on 503 and will render its
 * "layanan sedang tidak tersedia" message. That is close enough to the truth —
 * the user's next action (wait, retry) is identical — and far better than the
 * unhandled 500 this replaces.
 */
function unavailable(error: unknown) {
  console.error("[auth-guard] could not resolve the caller:", error);
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: "SERVICE_UNAVAILABLE", message: "Layanan sedang bermasalah. Coba lagi sebentar lagi." },
      { status: 503 },
    ),
  };
}

/**
 * Requires nothing but a valid session.
 *
 * The loosest of the three, and deliberately so: /api/user/change-password
 * touches no company-scoped data and needs no role, so demanding a companyId
 * there would lock out a user who has not been assigned to a company yet —
 * someone who can still sign in, and whose password is still theirs to change.
 * Prefer requireUser unless you can say why the company does not matter.
 */
export async function requireSession(
  req: Request,
  options: GuardOptions = {},
): Promise<SessionGuard> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return deny(401, options.unauthorized ?? "Unauthorized");
    return { ok: true, userId: session.user.id };
  } catch (error) {
    return unavailable(error);
  }
}

/**
 * Requires a signed-in user who belongs to a company.
 *
 * `companyId` is part of the check, not a detail: it is the key every
 * tenant-scoped query is keyed by, so a user without one has no data to be shown
 * and no tenant to be scoped to. Rejecting here is what stops that becoming a
 * query with an undefined scope further down.
 */
export async function requireUser(
  req: Request,
  options: GuardOptions = {},
): Promise<Guard> {
  let row: UserRow | undefined;
  let userId: string;

  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return deny(401, options.unauthorized ?? "Unauthorized");
    userId = session.user.id;

    // Read from the database rather than trusting the session payload, even
    // though better-auth carries `role` and `companyId` on it (see
    // additionalFields in @/lib/auth). The session is minted at sign-in and
    // cached in a cookie for seven days; a demotion from admin, a move between
    // companies, or a deactivation would not reach it until then. The row is the
    // authority on what the user is right now.
    [row] = await db.select(SELECTED).from(users).where(eq(users.id, userId)).limit(1);
  } catch (error) {
    return unavailable(error);
  }

  // No row means the session outlived the account it belonged to — a deleted
  // user holding a live cookie. Not logged through denyAuthed: there is no
  // account left for the log line to be about.
  if (!row) return deny(403, options.forbidden ?? "Forbidden");
  if (!row.companyId) {
    return denyAuthed(req, "no-company", userId, options.forbidden ?? "Forbidden");
  }

  return { ok: true, user: { ...row, companyId: row.companyId } };
}

/**
 * Requires a signed-in company admin.
 *
 * Deliberately answers 403 for a signed-in employee rather than 404 or 401: the
 * dashboard uses the difference to decide where to send them — 401 to /login,
 * 403 back to /chat — and telling an authenticated employee that an admin page
 * exists discloses nothing they cannot see in their own navigation.
 */
export async function requireAdmin(
  req: Request,
  options: GuardOptions = {},
): Promise<Guard> {
  const guard = await requireUser(req, options);
  if (!guard.ok) return guard;

  if (guard.user.role !== "admin") {
    return denyAuthed(req, "not-admin", guard.user.id, options.forbidden ?? "Forbidden");
  }

  return guard;
}
