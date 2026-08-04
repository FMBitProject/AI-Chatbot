// The site's canonical origin, in one place.
//
// Three separate things need it and none of them can afford to disagree:
// the root layout's `metadataBase` (what relative OG image paths resolve
// against), `sitemap.ts` (every <loc> must be absolute), and `robots.ts` (the
// Sitemap: line). A sitemap advertising one origin while canonical tags point
// at another is a duplicate-content problem invented out of nothing, so the
// env var is read and validated exactly once.

// www, not the apex: Vercel already 308-redirects intellibaseai.com to
// www.intellibaseai.com, so the apex is not a URL any crawler should be handed
// as canonical.
const CANONICAL_ORIGIN = "https://www.intellibaseai.com";

/**
 * The absolute origin, with no trailing slash.
 *
 * `new URL()` throws on an empty string and on anything without a scheme
 * ("intellibaseai.com" included), and callers evaluate this while the *root
 * layout* module is loaded — so a mistyped or blanked-out dashboard value would
 * not break the metadata, it would take down every route in the app. A
 * misconfigured origin is worth a wrong OG image; it is not worth a dead site,
 * so the bad value is discarded and reported instead of thrown.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return CANONICAL_ORIGIN;
  try {
    // `.origin` rather than `.toString()`: the latter appends a trailing slash,
    // which would turn every joined path into a double slash.
    return new URL(configured).origin;
  } catch {
    console.warn(
      `[metadata] NEXT_PUBLIC_APP_URL is not a valid absolute URL (${JSON.stringify(configured)}); ` +
        `falling back to ${CANONICAL_ORIGIN}. Social cards will point at the fallback origin.`,
    );
    return CANONICAL_ORIGIN;
  }
}

/** `absoluteUrl("/pricing")` -> `https://www.intellibaseai.com/pricing`. */
export function absoluteUrl(path: string): string {
  return path === "/" ? siteOrigin() : `${siteOrigin()}${path}`;
}
