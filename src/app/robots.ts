import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

// Everything behind a login, plus the flows that only make sense mid-journey.
//
// These are not secrets — `Disallow` is a request, not access control, and the
// real protection is the session check on each route. The point is that a
// crawler's budget on a site this small is better spent on the six marketing
// pages than on a login form, and that a search for the product should never
// surface a bare password-reset screen as the answer.
const DISALLOWED = [
  "/admin",
  "/chat",
  "/search",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/two-factor",
  "/payment/",
  "/api/",
  // Already `noindex` via their own metadata; listed so they are not crawled at
  // all rather than crawled and then discarded.
  "/maintenance",
  "/analytics-optout",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED,
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
