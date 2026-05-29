import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/chat/:path*", "/admin/:path*", "/login", "/register"],
};
