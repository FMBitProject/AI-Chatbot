// The server half of the error vocabulary: turning a thrown error into a
// response, and wrapping a route handler so that nothing can escape it.
//
// Split from ./errors because that module is imported by client components and
// this one imports next/server, which a "use client" file cannot pull in.
//
// The rule this file enforces is the one fifteen routes currently break: an
// unexpected throw must never reach Next's default handler. When it does, the
// caller gets a 500 whose body is not JSON, `res.json()` on the client throws a
// SyntaxError, and the message the user finally reads is "Unexpected token '<'".

import { NextResponse } from "next/server";
import { alertOps } from "./alerts";
import { AppError, RateLimitError, getUserMessage, type ErrorEnvelope } from "./errors";
import type { Lang } from "./i18n";

/** How long an unexpected-error alert for one route stays quiet after a send. */
const ALERT_WINDOW_MS = 30 * 60 * 1000;

/**
 * The response for a failed request.
 *
 * `label` names the route, and it is not optional: it is the only thing that
 * makes a log line searchable six weeks later, and it is also the alert's dedupe
 * key, so a route that starts failing raises one mail rather than one per
 * request. Use the same string the route's other log lines use — "chat",
 * "payment/webhook", "admin/upload".
 */
export function handleApiError(error: unknown, label: string, lang: Lang = "id"): NextResponse<ErrorEnvelope> {
  // Something we raised on purpose. The status, the code and the sentence were
  // all decided at the throw site, by the code that actually knew what went
  // wrong; there is nothing to work out here.
  if (error instanceof AppError) {
    // 4xx is the caller's problem and says nothing about our health, so it is
    // logged at warn and never alerts — a hundred people mistyping a password
    // must not be indistinguishable from the database being down.
    if (error.statusCode >= 500) {
      console.error(`[${label}] ${error.code}: ${error.message}`, error.cause ?? "");
    } else {
      console.warn(`[${label}] ${error.code}: ${error.message}`);
    }

    const res = NextResponse.json(error.envelope(lang), { status: error.statusCode });
    // For callers that only speak HTTP — a script hitting /api/v1/query does not
    // know to look in `details` for how long to wait.
    if (error instanceof RateLimitError && error.retryAfterMs !== undefined) {
      res.headers.set("Retry-After", String(Math.ceil(error.retryAfterMs / 1000)));
    }
    return res;
  }

  // Anything else is a bug, an outage, or a shape we did not anticipate. Log
  // everything, tell the caller nothing beyond "it failed" — the message on a
  // driver error can carry a connection string, and a stack trace names files.
  console.error(`[${label}] Unhandled error:`, error);

  // Raises it to a human. Deliberately fire-and-forget in effect but awaited in
  // form — alertOps never throws and never rejects, so this cannot turn a 500
  // into a hang or a second failure. It stays log-only until ALERT_EMAIL is set
  // in the environment, which is the one remaining step to make it audible.
  void alertOps({
    dedupeKey: `route-error:${label}:${error instanceof Error ? error.name : "unknown"}`,
    subject: `Unhandled error in ${label}`,
    details: {
      route: label,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    },
    windowMs: ALERT_WINDOW_MS,
  });

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR" as const, message: getUserMessage("INTERNAL_ERROR", lang) } },
    { status: 500 },
  );
}

/**
 * Wraps a route handler so an uncaught throw becomes a proper response.
 *
 * This is the one-line fix for the routes that have no try/catch at all:
 *
 * ```ts
 * export const GET = withApiErrors("admin/audit", async (req) => {
 *   const guard = await requireAdmin(req);
 *   if (!guard.ok) return guard.response;
 *   return NextResponse.json(await loadLogs(guard.user.companyId));
 * });
 * ```
 *
 * A handler is still free to catch things itself — this is the floor, not a
 * replacement for handling a failure the route actually understands. Throwing an
 * AppError is the better way to leave a handler, because the throw site is where
 * the status and the reason are known.
 *
 * Generic over the trailing arguments so it fits both plain routes and dynamic
 * ones, which Next calls with a context object carrying `params`.
 */
export function withApiErrors<A extends unknown[]>(
  label: string,
  handler: (req: Request, ...rest: A) => Promise<Response>,
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    try {
      return await handler(req, ...rest);
    } catch (error) {
      return handleApiError(error, label);
    }
  };
}
