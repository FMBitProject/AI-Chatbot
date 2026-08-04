import type { MetadataRoute } from "next";
import { INDUSTRIES } from "@/lib/industries";
import { absoluteUrl } from "@/lib/site-url";

// Only the marketing surface belongs here. A sitemap is a list of pages a
// stranger should be able to land on from a search result, which rules out the
// whole authenticated app (/chat, /admin, /search), the auth screens, and the
// payment callbacks — those are also disallowed in robots.ts, and listing a URL
// here that robots.ts blocks is a contradiction Search Console reports as an
// error rather than silently ignoring.
const STATIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/roi", changeFrequency: "monthly", priority: 0.7 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // Derived from the industry registry rather than hand-listed: `href` is the
  // field that already means "this vertical has a real page" (the landing strip
  // uses it to decide what is clickable), so a new /solusi/* page enters the
  // sitemap the moment it exists. Hand-listing is how the second vertical ships
  // and never gets crawled.
  const verticals = INDUSTRIES.filter((i) => i.href).map((i) => ({
    url: absoluteUrl(i.href!),
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    ...STATIC_ROUTES.map((r) => ({
      url: absoluteUrl(r.path),
      lastModified: new Date(),
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...verticals,
  ];
}
