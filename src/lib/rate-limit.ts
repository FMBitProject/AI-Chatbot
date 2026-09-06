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

/**
 * Client IP for rate-limit keys.
 *
 * The whole mechanism rests on this value not being chosen by the caller: a
 * key an attacker can vary is a limit an attacker can reset. This used to
 * read the *first* entry of `x-forwarded-for` on the assumption that Vercel
 * overwrites that header — which is an assumption about someone else's proxy
 * that nothing here can check, and if it is wrong the entry is attacker-typed
 * text and every limit in the app falls to one extra header.
 *
 * So it is no longer assumed. `x-vercel-forwarded-for` is set by the platform
 * and cannot be spoofed by the client, and is preferred where present.
 * Failing that, the *last* entry of the forwarded chain is the one appended
 * by the nearest proxy — anything earlier may have been sent by the client.
 * That reading is correct whether the platform overwrites the header (one
 * entry, first and last are the same) or appends to it (last is the real
 * peer), which is exactly why it does not need the assumption.
 *
 * Note what this does not fix: `buckets` is a Map in this process's memory,
 * so on a serverless platform each instance counts on its own and an
 * advertised "5 per 15 minutes" is really that times however many instances
 * are warm. Closing that needs shared storage (Vercel KV, Upstash) and is a
 * deliberate trade, not an oversight.
 */
export function getClientIp(req: Request): string {
  const platform = req.headers.get("x-vercel-forwarded-for");
  if (platform) return platform.split(",")[0].trim();

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",");
    return hops[hops.length - 1].trim();
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}
