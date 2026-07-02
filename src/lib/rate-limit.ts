// Lightweight in-memory fixed-window rate limiter for our custom API routes.
// (better-auth's own endpoints have their own limiter — see src/lib/auth.ts.)
//
// Buckets live in module scope, so limits are enforced per server instance.
// On serverless this is best-effort (each warm instance counts separately),
// which still blunts brute-force and spam without adding a store dependency.

type Rule = { max: number; windowMs: number };
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_ENTRIES = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_ENTRIES) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/**
 * Count one attempt against `key`. Returns `ok: false` (with seconds until the
 * window resets) once the caller exceeds `rule.max` within the window.
 */
export function consumeRateLimit(key: string, rule: Rule): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > rule.max) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Check `key` without counting an attempt. Pair with `recordFailure` to only
 * penalize failed attempts (e.g. invalid API keys) instead of all traffic.
 */
export function isRateLimited(key: string, rule: Rule): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt > Date.now() && b.count >= rule.max;
}

/** Count one failed attempt against `key` (see `isRateLimited`). */
export function recordFailure(key: string, rule: Rule): void {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
  } else {
    b.count++;
  }
}

/** Client IP for rate-limit keys; on Vercel x-forwarded-for is platform-set. */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
