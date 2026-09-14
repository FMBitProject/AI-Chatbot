export function retryDelay(value: string | null, now = Date.now()): number {
  if (value && /^\d+$/.test(value)) return Math.max(1000, Number(value) * 1000);
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(1000, date - now) : 60_000;
}

export function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function fetchPages<T extends { id: string }>(path: string, options: {
  signal?: AbortSignal;
  wait?: typeof waitForRetry;
} = {}): Promise<T[]> {
  const items = new Map<string, T>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    options.signal?.throwIfAborted();
    const url = new URL(path, "https://local.invalid");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    let response: Response;
    let retries = 0;
    for (;;) {
      response = await fetch(`${url.pathname}${url.search}`, { signal: options.signal });
      if (response.status !== 429 || retries++ >= 5) break;
      const delay = retryDelay(response.headers.get("Retry-After"));
      if (delay > 300_000) throw new Error("List retry exceeds five minutes");
      await response.body?.cancel();
      await (options.wait ?? waitForRetry)(delay, options.signal);
    }
    options.signal?.throwIfAborted();
    if (!response.ok) throw new Error(`List request failed (${response.status})`);
    const page: unknown = await response.json();
    if (!Array.isArray(page) || page.some(item => !item || typeof item.id !== "string")) throw new Error("Invalid list response");
    for (const item of page) items.set(item.id, item);
    cursor = response.headers.get("X-Next-Cursor");
    if (cursor === null) return [...items.values()];
    if (!cursor || seen.has(cursor)) throw new Error("Invalid pagination continuation");
    seen.add(cursor);
  }
}
