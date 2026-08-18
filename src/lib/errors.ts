// The shared error vocabulary: one base class, one wire format, one place that
// turns a code into something a person can read.
//
// This file exists because the app currently answers a failed request in four
// different shapes, and three of them disagree about what `error` even means:
//
//   { error: "Email sudah terdaftar." }                       — a human sentence
//   { error: "SEAT_FROZEN",  message: "..." }                 — a SCREAMING code
//   { error: "already_paid", message: "..." }                 — a lower_snake code
//
// A client cannot tell which it is holding without knowing which route it
// called, so the honest ones hard-code a branch per code and the careless ones
// render `SEAT_FROZEN` into a toast for an employee to read. The fourth shape is
// the absence of one: fifteen routes have no try/catch at all, so an unexpected
// throw becomes Next's own 500 with a body that is not JSON, and `res.json()` on
// the client throws a SyntaxError whose message ("Unexpected token '<'") is what
// the user finally sees.
//
// Nothing here imports from next/server, deliberately: the client needs the
// codes and `readApiError` as much as the routes need the classes, and a module
// that pulls in server-only APIs cannot be imported from a "use client" file.
// The NextResponse half lives in ./api-error.
//
// Adoption is route-by-route, not all at once — see `readApiError`, which reads
// the old shapes too so a migrated client keeps working against a route that
// has not moved yet.

import type { Lang } from "./i18n";

/**
 * Every failure this API is allowed to name.
 *
 * A closed union rather than `string`, so a typo in a route is a compile error
 * instead of a code no client has ever heard of. The first group is generic and
 * maps onto HTTP; the second is this product's own vocabulary, and each of those
 * five is already being sent over the wire today — they are collected here, not
 * invented.
 */
export type ErrorCode =
  // Generic. These replace the ~55 places that currently send a bare sentence.
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  // Domain. Already in use; the client branches on these by name.
  | "QUOTA_EXCEEDED"
  | "SEAT_FROZEN"
  | "AI_REQUIRES_PAID_PLAN"
  | "BYOK_KEY_UNREADABLE"
  | "AI_RATE_LIMIT"
  | "AI_ERROR"
  // Input bounds. Also already in use — /api/chat and /api/search send these
  // with a `limit` alongside. They were missing from this union at first, which
  // meant getUserMessage fell through to INTERNAL_ERROR and told someone whose
  // question was too long that something had gone wrong on our end.
  | "QUESTION_TOO_LONG"
  | "QUERY_TOO_LONG"
  | "INVALID_FOLDER";

/** The body every failed request answers with, once a route has been migrated. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    /** Only present when the client can do something with it — a quota's limit, a field list. */
    details?: unknown;
  };
}

/**
 * Base class for every failure the app raises on purpose.
 *
 * `message` is the developer-facing sentence and goes to the log. What a user
 * reads comes from `getUserMessage(code, lang)` unless a route passes something
 * better — see `userMessage`. Keeping those two separate is the whole point:
 * "Gemini decrypt failed: unable to authenticate data" belongs in a log line,
 * never in a toast.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  /**
   * A sentence written for the person who will read it, when the generic one
   * for this code is not specific enough — "Kuota bulanan Anda (300 pertanyaan)
   * sudah habis" rather than "Terlalu banyak permintaan". Left undefined means
   * `getUserMessage` answers instead.
   */
  readonly userMessage?: string;
  /**
   * The language this failure should be reported in, when the throw site knows
   * it and the response layer cannot. /api/v1/query is the case that needs it:
   * the caller asks for English in the request body, which is long out of scope
   * by the time withApiErrors turns the throw into a response, so without this
   * an English integration was answered in Indonesian.
   */
  readonly lang?: Lang;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode = 500,
    options: { details?: unknown; userMessage?: string; cause?: unknown; lang?: Lang } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.userMessage = options.userMessage;
    this.lang = options.lang;
    if (options.cause !== undefined) this.cause = options.cause;
    // Not strictly required at the current ES2017 build target, where `extends
    // Error` already produces a real subclass. It is one call, and it makes
    // `instanceof AppError` survive a build that ever targets lower — a failure
    // that shows up as a correct-looking error taking the wrong branch, which is
    // among the more confusing bugs to chase.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * The wire body for this error, ready to be serialised.
   *
   * `lang` is the responder's best guess; the error's own `lang` wins when it
   * has one, because the throw site knew and the responder is guessing.
   */
  envelope(lang: Lang = "id"): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.userMessage ?? getUserMessage(this.code, this.lang ?? lang),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

/* ── Generic failures ─────────────────────────────────────────────────────── */

/** A request whose body or query the route refuses to work with. */
export class ValidationError extends AppError {
  constructor(message: string, options: { details?: unknown; userMessage?: string } = {}) {
    super(message, "VALIDATION_ERROR", 400, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", options: { userMessage?: string } = {}) {
    super(message, "UNAUTHORIZED", 401, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied", options: { userMessage?: string } = {}) {
    super(message, "FORBIDDEN", 403, options);
  }
}

export class NotFoundError extends AppError {
  // `resource` and `id` go to the log, never to the reader: telling an
  // unauthenticated caller that order IB-1042 exists but is not theirs is a
  // slower way of listing the orders.
  constructor(resource: string, id?: string, options: { userMessage?: string } = {}) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, "NOT_FOUND", 404, options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: { userMessage?: string } = {}) {
    super(message, "CONFLICT", 409, options);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large", options: { userMessage?: string } = {}) {
    super(message, "PAYLOAD_TOO_LARGE", 413, options);
  }
}

/**
 * Too many requests from one caller.
 *
 * `retryAfterMs` is surfaced as `details.retryAfterMs` so a client can wait the
 * right amount instead of guessing, and `api-error` turns it into a `Retry-After`
 * header for callers that only speak HTTP.
 */
export class RateLimitError extends AppError {
  readonly retryAfterMs?: number;
  constructor(message = "Rate limit exceeded", retryAfterMs?: number, options: { userMessage?: string } = {}) {
    super(message, "RATE_LIMITED", 429, {
      ...options,
      ...(retryAfterMs !== undefined ? { details: { retryAfterMs } } : {}),
    });
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * A service we depend on answered badly — Midtrans, Google Drive, Slack.
 *
 * 502 rather than 500, because the distinction is the first thing anyone reading
 * the logs wants: our bug, or theirs.
 */
export class UpstreamError extends AppError {
  constructor(service: string, message: string, options: { cause?: unknown; userMessage?: string } = {}) {
    super(`${service}: ${message}`, "UPSTREAM_ERROR", 502, options);
  }
}

/* ── This product's own failures ──────────────────────────────────────────── */

/**
 * The workspace has spent its allowance.
 *
 * `limit` and `period` are already sent today and the chat page already branches
 * on `period` to choose between three different explanations, so they are part
 * of the contract rather than debugging colour.
 */
export class QuotaExceededError extends AppError {
  constructor(limit: number, period: "daily" | "monthly" | "daily-user", options: { userMessage?: string } = {}) {
    super(`Quota exceeded: ${limit} per ${period}`, "QUOTA_EXCEEDED", 429, {
      ...options,
      details: { limit, period },
    });
  }
}

/** The employee's seat is frozen because the company is over its plan's seat count. */
export class SeatFrozenError extends AppError {
  constructor(userMessage: string) {
    super("Seat frozen: company is over its plan seat limit", "SEAT_FROZEN", 403, { userMessage });
  }
}

/** AI answers are a paid feature and this workspace is on the free tier. */
export class PaidPlanRequiredError extends AppError {
  constructor(userMessage: string) {
    super("AI answers require a paid plan", "AI_REQUIRES_PAID_PLAN", 403, { userMessage });
  }
}

/**
 * A stored BYOK provider key could not be decrypted.
 *
 * 503, not 500, and the distinction is load-bearing for the quota: this is a
 * standing failure that persists until an operator fixes the environment, so
 * every request will hit it. Charging a question for it would drain a
 * customer's whole daily allowance into failures. Callers resolve it before
 * spending quota for exactly that reason.
 */
export class ByokUnreadableError extends AppError {
  constructor(userMessage: string, options: { cause?: unknown } = {}) {
    super("Stored BYOK key could not be decrypted", "BYOK_KEY_UNREADABLE", 503, {
      ...options,
      userMessage,
    });
  }
}

/**
 * Every model in the chain refused.
 *
 * `provider` names the one that refused last, not the one at the top of the
 * chain — reporting "groq" after Gemini turned us down sends an admin to the
 * wrong status page. `rateLimited` separates "come back in a minute" from
 * "something is broken", which are different messages to a reader and different
 * decisions to a script.
 *
 * `provider` is optional, and omitting it is a real answer rather than
 * laziness: `generateWithFallback` rethrows the last error unchanged without
 * saying which link raised it, so a caller using that helper genuinely does not
 * know. Leaving the field out says so. Guessing would produce exactly the
 * wrong-status-page problem the parameter exists to prevent.
 */
export class AiUnavailableError extends AppError {
  constructor(rateLimited: boolean, provider?: string, options: { cause?: unknown; lang?: Lang } = {}) {
    super(
      provider
        ? `AI provider ${provider} ${rateLimited ? "rate limited" : "failed"}`
        : `Every AI provider in the chain ${rateLimited ? "rate limited" : "failed"}`,
      rateLimited ? "AI_RATE_LIMIT" : "AI_ERROR",
      503,
      { ...options, ...(provider ? { details: { provider } } : {}) },
    );
  }
}

/* ── Code → sentence ──────────────────────────────────────────────────────── */

const USER_MESSAGES: Record<ErrorCode, { id: string; en: string }> = {
  VALIDATION_ERROR: {
    id: "Data yang dikirim tidak valid. Periksa kembali isian Anda.",
    en: "The data sent is not valid. Please check your input.",
  },
  UNAUTHORIZED: {
    id: "Sesi Anda sudah berakhir. Silakan masuk kembali.",
    en: "Your session has ended. Please sign in again.",
  },
  FORBIDDEN: {
    id: "Anda tidak memiliki akses untuk melakukan ini.",
    en: "You don't have permission to do that.",
  },
  NOT_FOUND: {
    id: "Data yang Anda cari tidak ditemukan.",
    en: "The item you're looking for could not be found.",
  },
  CONFLICT: {
    id: "Data ini sudah ada.",
    en: "This item already exists.",
  },
  PAYLOAD_TOO_LARGE: {
    id: "Data yang dikirim terlalu besar.",
    en: "The data sent is too large.",
  },
  RATE_LIMITED: {
    id: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
    en: "Too many requests. Please wait a moment and try again.",
  },
  UPSTREAM_ERROR: {
    id: "Layanan pihak ketiga sedang bermasalah. Coba lagi beberapa saat lagi.",
    en: "An external service is having trouble. Please try again shortly.",
  },
  SERVICE_UNAVAILABLE: {
    id: "Layanan sedang tidak tersedia. Coba lagi beberapa saat lagi.",
    en: "The service is unavailable. Please try again shortly.",
  },
  INTERNAL_ERROR: {
    id: "Terjadi kesalahan di sisi kami. Silakan coba lagi.",
    en: "Something went wrong on our end. Please try again.",
  },
  // The five below are nearly always overridden by a `userMessage` carrying the
  // real numbers ("300 pertanyaan / hari"). These are the fallback for a client
  // that receives the code without one — worth writing well anyway, because the
  // fallback is what shows up on the day something forgets to pass the detail.
  QUOTA_EXCEEDED: {
    id: "Kuota pertanyaan Anda sudah habis.",
    en: "Your question quota has run out.",
  },
  SEAT_FROZEN: {
    id: "Akun Anda sedang tidak aktif. Hubungi admin perusahaan Anda.",
    en: "Your account is inactive. Please contact your company admin.",
  },
  AI_REQUIRES_PAID_PLAN: {
    id: "Jawaban AI tersedia mulai paket berbayar.",
    en: "AI answers are part of the paid plans.",
  },
  BYOK_KEY_UNREADABLE: {
    id: "Kunci API tersimpan tidak dapat dibaca. Hubungi dukungan.",
    en: "The stored API key could not be read. Please contact support.",
  },
  AI_RATE_LIMIT: {
    id: "Layanan AI sedang sibuk. Tunggu beberapa menit lalu coba lagi.",
    en: "The AI service is busy. Please wait a few minutes and try again.",
  },
  AI_ERROR: {
    id: "Layanan AI sedang mengalami gangguan. Silakan coba lagi.",
    en: "The AI service is having trouble. Please try again.",
  },
  // These three arrive with a `limit` in `details`, and a caller that shows it
  // can say something better than the sentence here. The sentence still has to
  // stand on its own, because the generic fallback for an unknown code claims
  // the fault is ours — which is the opposite of true for all three.
  QUESTION_TOO_LONG: {
    id: "Pertanyaan Anda terlalu panjang. Persingkat lalu coba lagi.",
    en: "Your question is too long. Please shorten it and try again.",
  },
  QUERY_TOO_LONG: {
    id: "Kata kunci pencarian terlalu panjang. Persingkat lalu coba lagi.",
    en: "That search is too long. Please shorten it and try again.",
  },
  INVALID_FOLDER: {
    id: "Folder yang dipilih tidak valid. Pilih folder lain lalu coba lagi.",
    en: "That folder is not valid. Pick another one and try again.",
  },
};

/**
 * The sentence a person should read for `code`.
 *
 * Falls back to INTERNAL_ERROR for anything unrecognised, which is what a client
 * running an older build does when a route starts sending a code it has never
 * heard of. A vague-but-true message beats a blank toast.
 */
export function getUserMessage(code: string, lang: Lang = "id"): string {
  const entry = USER_MESSAGES[code as ErrorCode] ?? USER_MESSAGES.INTERNAL_ERROR;
  return entry[lang];
}

/* ── Reading an error on the client ───────────────────────────────────────── */

/** What a client gets back from `readApiError`, whatever shape the route sent. */
export interface ApiErrorInfo {
  code: ErrorCode | string;
  /** Safe to show a user as-is. */
  message: string;
  status: number;
  details?: unknown;
}

/**
 * True for something that looks like a machine code rather than a sentence.
 *
 * The heuristic is what lets the migration run route-by-route instead of in one
 * commit: it tells the legacy shapes apart, because `error` holds a code in some
 * and a human sentence in others.
 *
 * Only consulted when there is no sibling `message` to settle it — see
 * `readApiError`. That ordering is what fixed the case this originally got
 * wrong: /api/payment/create answers `{ error: "already_paid", message: "…" }`
 * with lowercase codes, and a rule based on capitalisation alone read
 * `already_paid` as the sentence to show a customer while discarding the real
 * one sitting beside it. Shape decides first; casing is only the tie-breaker.
 *
 * Every remaining code that arrives without a message is SCREAMING_SNAKE_CASE,
 * and every bare sentence has a lowercase letter or a space ("Unauthorized",
 * "Not found", "Email sudah terdaftar."), so those two sets cannot collide.
 *
 * Delete this, and the legacy branches in `readApiError`, once every route sends
 * an envelope — `grep -rn 'error: "' src/app/api` returning nothing is the
 * signal that day has come.
 */
function looksLikeCode(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

/** Status → the closest generic code, for a response that carries no code at all. */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400: return "VALIDATION_ERROR";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 429: return "RATE_LIMITED";
    case 502: return "UPSTREAM_ERROR";
    case 503: return "SERVICE_UNAVAILABLE";
    default: return "INTERNAL_ERROR";
  }
}

/**
 * Turns any failed `fetch` response into a code and a sentence fit to show.
 *
 * Never throws and never rejects. That is the point of it: the calling site is
 * already on its error path, and `await res.json()` on a route that answered
 * with Next's HTML 500 throws a SyntaxError which then replaces the real problem
 * with "Unexpected token '<'" in the user's toast. Reaching for this instead of
 * `res.json()` removes that failure mode from every call site at once.
 *
 * Handles all five shapes currently reachable, so clients and routes can migrate
 * independently and in either order.
 */
export async function readApiError(res: Response, lang: Lang = "id"): Promise<ApiErrorInfo> {
  const fallback: ApiErrorInfo = {
    code: codeForStatus(res.status),
    message: getUserMessage(codeForStatus(res.status), lang),
    status: res.status,
  };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // Not JSON at all: an un-migrated route's uncaught throw, a proxy's error
    // page, or a body already consumed by the caller. The status is still true.
    return fallback;
  }

  if (typeof body !== "object" || body === null) return fallback;
  const shape = body as { error?: unknown; message?: unknown };

  // Current shape: { error: { code, message, details? } }
  if (typeof shape.error === "object" && shape.error !== null) {
    const inner = shape.error as { code?: unknown; message?: unknown; details?: unknown };
    return {
      code: typeof inner.code === "string" ? inner.code : fallback.code,
      message: typeof inner.message === "string" && inner.message.trim()
        ? inner.message
        : getUserMessage(typeof inner.code === "string" ? inner.code : fallback.code, lang),
      status: res.status,
      ...(inner.details !== undefined ? { details: inner.details } : {}),
    };
  }

  if (typeof shape.error === "string") {
    const sibling = typeof shape.message === "string" && shape.message.trim() ? shape.message : null;

    // Legacy B: a code with its sentence beside it —
    //   { error: "SEAT_FROZEN",   message: "Akun Anda tidak aktif." }   (chat, v1/query)
    //   { error: "already_paid",  message: "Pesanan ini sudah lunas." } (payment/create)
    //
    // The sibling `message` is what decides, not the casing of `error`. A route
    // that bothered to send a separate human sentence has already told us that
    // `error` is the machine half, whatever it looks like — and the two
    // conventions in this codebase disagree about that: the answering channels
    // use SCREAMING_SNAKE and the payment routes use lower_snake. Judging by
    // capitalisation put nine payment failures in the wrong branch and showed a
    // customer "already_paid" while throwing away "Pesanan ini sudah lunas."
    if (sibling !== null) {
      return { code: shape.error, message: sibling, status: res.status };
    }

    // A code with no sentence: look one up. Here casing is all there is to go on.
    if (looksLikeCode(shape.error)) {
      return { code: shape.error, message: getUserMessage(shape.error, lang), status: res.status };
    }

    // Legacy A: { error: "Email sudah terdaftar." } — the sentence itself, and
    // it is a good one. Routes wrote these for people to read, so prefer them
    // over the generic message for the status.
    return { code: fallback.code, message: shape.error, status: res.status };
  }

  return fallback;
}
