// Request-body validation shared by the API routes.
//
// Every one of these exists because a route handler reads JSON that a client
// controls, and TypeScript's `as` is a compile-time claim about runtime data it
// has never seen. `await req.json() as { question: string }` does not check
// anything: `question` can arrive as a number, an object, or absent entirely,
// and the first `.trim()` or `.length` on it throws a TypeError that escapes the
// handler as a 500 — a malformed request reported as our own outage.
//
// The length caps are the other half. An unbounded string is a bill: it is
// embedded by Gemini, sent to Groq, and stored forever, all on a quota that
// counts requests rather than bytes.

/** Upper bounds, in characters. Generous enough that no honest caller notices. */
export const LIMITS = {
  /** A question asked through chat, Slack or the public API. */
  question: 2_000,
  /** One message of chat history replayed to the model. */
  message: 4_000,
  /** How many past messages are replayed at all. */
  history: 20,
  /** Free-text company persona, injected into every system prompt. */
  persona: 2_000,
  /** Display names: API key labels, employee names, company names. */
  name: 100,
  /** An email address. Longer than RFC 5321's 254 is not an address. */
  email: 254,
  /** A password. Bounded because scrypt hashes whatever it is given. */
  password: 200,
} as const;

/**
 * A non-empty string of at most `max` characters, trimmed — or null.
 *
 * Trimming before the length check, and returning the trimmed value, so callers
 * validate and use the same string. Validating one form and storing another is
 * how "  IB-1  " becomes a 404 for an order that exists.
 */
export function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** True when `value` is exactly one of `allowed`. Narrows the type on the way. */
export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/**
 * Parses a JSON request body, or returns null.
 *
 * Unguarded, `req.json()` throws on a malformed body and Next answers 500. The
 * shape check matters as much as the parse: `null`, `4` and `"x"` are all valid
 * JSON, and destructuring a field off any of them throws.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
