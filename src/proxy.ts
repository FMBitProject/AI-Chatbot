import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter (resets on cold start — use Redis for production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// --- Maintenance mode (manual kill-switch) ---------------------------------
// Toggle by setting MAINTENANCE_MODE=true in the environment (Vercel env var,
// then redeploy). When off (the default) none of this code runs, so normal
// behaviour is completely unchanged.
//
// Optional preview bypass: set MAINTENANCE_BYPASS_SECRET to a random string.
// Visiting any URL with ?mnt-bypass=<secret> stores a cookie that lets you
// (the maintainer) browse the real site while everyone else sees the page.
const BYPASS_QUERY = "mnt-bypass";
const BYPASS_COOKIE = "mnt-bypass";

function handleMaintenance(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  const secret = process.env.MAINTENANCE_BYPASS_SECRET;

  // 0. Midtrans' payment notification is never taken offline.
  //
  // Midtrans re-delivers a notification we did not answer with a 2xx, but only a
  // limited number of times over roughly a day — after that the notification is
  // gone for good. Maintenance lasting longer than that retry window would
  // therefore turn every payment made during it into money received for a
  // subscription that is never activated, silently: no log, no alert, and no
  // customer on the site to trigger the /api/payment/verify recovery path (a
  // bank transfer is typically paid long after the tab was closed).
  //
  // Safe to leave open, because this endpoint authenticates its own callers:
  // it verifies the Midtrans signature and re-confirms the outcome against the
  // Midtrans status API before granting anything.
  //
  // Matched with a trailing slash tolerated. The exemption is configured by
  // hand in the Midtrans dashboard, and an exact comparison would let one
  // stray "/" quietly put payments back behind the 503 — a failure that only
  // shows up during a maintenance window, which is the worst possible time to
  // discover it.
  if (pathname.replace(/\/+$/, "") === "/api/payment/webhook") {
    return null;
  }

  // 1. Maintainer unlocks a bypass cookie via ?mnt-bypass=<secret>.
  if (secret && req.nextUrl.searchParams.get(BYPASS_QUERY) === secret) {
    const url = req.nextUrl.clone();
    url.searchParams.delete(BYPASS_QUERY);
    const res = NextResponse.redirect(url);
    res.cookies.set(BYPASS_COOKIE, secret, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
    });
    return res;
  }

  // 2. A valid bypass cookie sees the real site.
  if (secret && req.cookies.get(BYPASS_COOKIE)?.value === secret) {
    return null;
  }

  // 3. Never intercept the maintenance page itself (avoids a rewrite loop).
  if (pathname === "/maintenance") {
    return null;
  }

  // 4. API clients get a 503 JSON; everyone else gets the maintenance page.
  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "Service temporarily unavailable for maintenance." },
      { status: 503, headers: { "Retry-After": "3600" } },
    );
  }
  return NextResponse.rewrite(new URL("/maintenance", req.url), { status: 503 });
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Maintenance kill-switch runs before everything else.
  if (process.env.MAINTENANCE_MODE === "true") {
    const maintenanceResponse = handleMaintenance(req);
    if (maintenanceResponse) return maintenanceResponse;
  }

  // Rate limit API endpoints.
  //
  // /api/folders and /api/user/me are here because they are cheap to ask for
  // and not cheap to answer — the first runs a DISTINCT over a company's whole
  // documents table. Both are read once per page mount, so a real visitor
  // spends one request of the sixty on each; only a loop notices the ceiling.
  //
  // What is deliberately NOT here: /api/admin/documents. The dashboard polls it
  // every three seconds while an import is indexing — twenty requests a minute,
  // a third of this budget, from one honest admin watching a progress bar. The
  // bucket below is keyed by IP alone and shared across every path in this list,
  // so adding that route would let a long import rate-limit the admin's own
  // chat. Anything polled belongs behind a per-route limit (see
  // consumeRateLimit in @/lib/rate-limit), not this one.
  if (
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/search") ||
    pathname.startsWith("/api/folders") ||
    pathname.startsWith("/api/user/me")
  ) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (isRateLimited(ip)) {
      return new NextResponse(JSON.stringify({ error: "Too many requests. Please slow down." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" },
      });
    }
  }

  const sessionToken =
    req.cookies.get("better-auth.session_token")?.value ??
    req.cookies.get("__Secure-better-auth.session_token")?.value;

  if (!sessionToken) {
    if (pathname.startsWith("/chat") || pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (pathname === "/login" || pathname === "/register") {
    if (sessionToken) {
      return NextResponse.redirect(new URL("/chat", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route so maintenance mode can cover the whole site, but skip
  // Next internals, the service worker, and static assets so they keep loading
  // (including on the maintenance page itself). The existing rate-limit and
  // auth checks above are still gated by their own path prefixes, so widening
  // the matcher does not change their behaviour.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|txt|xml)$).*)",
  ],
};
