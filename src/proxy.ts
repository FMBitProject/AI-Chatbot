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

  // Rate limit API endpoints
  if (pathname.startsWith("/api/chat") || pathname.startsWith("/api/search")) {
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
