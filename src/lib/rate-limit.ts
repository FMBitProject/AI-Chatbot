// Shared PostgreSQL counters; failures reject instead of allowing traffic.
// Loaded on use so pure IP parsing can still run without a database in tests.
type Rule = { max: number; windowMs: number };

export async function consumeRateLimit(key: string, rule: Rule): Promise<{ ok: boolean; retryAfter: number }> {
  const { sharedBucket } = await import("./rate-limit-store");
  const bucket = await sharedBucket(key, rule, true);
  return { ok: bucket.count <= rule.max, retryAfter: bucket.count > rule.max ? bucket.retryAfter : 0 };
}

export async function isRateLimited(key: string, rule: Rule): Promise<boolean> {
  const { sharedBucket } = await import("./rate-limit-store");
  return (await sharedBucket(key, rule, false)).count >= rule.max;
}

export async function recordFailure(key: string, rule: Rule): Promise<void> {
  await consumeRateLimit(key, rule);
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
