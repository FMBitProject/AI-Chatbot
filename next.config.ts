import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Midtrans Snap (pricing page + SubscriptionTab) injects an external script
// that opens a payment iframe and XHRs back to Midtrans — every directive that
// touches it must whitelist both the production and sandbox hosts. 3-D Secure
// bank pages render nested *inside* the Midtrans iframe, so no bank domains
// are needed here. Fonts (next/font) are self-hosted at build time.
const MIDTRANS_APP = "https://app.midtrans.com https://app.sandbox.midtrans.com";
const MIDTRANS_API = "https://api.midtrans.com https://api.sandbox.midtrans.com";

// Google Analytics 4 via @next/third-parties (gated on cookie consent in
// AnalyticsConsent.tsx). gtag.js loads from googletagmanager.com; GA4 beacons
// POST to google-analytics.com — including region endpoints like
// region1.google-analytics.com and analytics.google.com, hence the wildcards —
// and a fallback tracking pixel loads as an image. Whitelisting these hosts
// does not load GA on its own; the component still requires consent + a set
// NEXT_PUBLIC_GA_ID before any request is made.
const GA_TAGMANAGER = "https://www.googletagmanager.com";
const GA_ANALYTICS = "https://*.google-analytics.com https://*.analytics.google.com";

// Meta (Facebook) Pixel for the running Meta Ads campaign, gated on cookie
// consent in MetaPixel.tsx. The snippet injects fbevents.js from
// connect.facebook.net; the events it reports leave as image beacons and
// fetches to www.facebook.com. As with GA4, whitelisting these hosts loads
// nothing by itself — the component still needs consent plus a set
// NEXT_PUBLIC_META_PIXEL_ID.
const META_PIXEL_SCRIPT = "https://connect.facebook.net";
const META_PIXEL_BEACON = "https://www.facebook.com";

// The YouTube demo embed's grant stood here (youtube-nocookie in frame-src,
// i.ytimg.com in images.remotePatterns). The section that used it is gone —
// the landing page's live demo chat says the same thing better — and a CSP
// grant with no feature behind it is a hole nobody is watching, so it went with
// it. Restoring the video means restoring both.

// Admin-only: the Google Drive import feature (GoogleDrivePicker.tsx) loads
// Google Identity Services + the Picker's gapi loader as scripts, calls the
// Drive/Picker APIs, and renders the Picker itself in an iframe from Google's
// domain. None of this runs on any public page, but CSP is site-wide, so it
// has to be here rather than scoped to /admin.
const GOOGLE_IDENTITY = "https://accounts.google.com";
const GOOGLE_APIS = "https://apis.google.com";
const GOOGLE_DRIVE_API = "https://www.googleapis.com";
const GOOGLE_PICKER_FRAME = "https://accounts.google.com https://content.googleapis.com https://docs.google.com";
const GOOGLE_THUMBNAILS = "https://*.googleusercontent.com";

// No nonces: per the Next.js CSP guide, nonce-based CSP forces every page into
// dynamic rendering. 'unsafe-inline' keeps static optimization; the policy
// still blocks external script injection, exfiltration and framing.
// Dev needs 'unsafe-eval' (React error stacks) and ws: (HMR).
const csp = [
  "default-src 'self'",
  // TODO: LOW — replace script-src unsafe-inline with per-response nonces and review dynamic rendering requirements.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${MIDTRANS_APP} ${GA_TAGMANAGER} ${META_PIXEL_SCRIPT} ${GOOGLE_IDENTITY} ${GOOGLE_APIS}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${MIDTRANS_APP} ${GA_TAGMANAGER} ${GA_ANALYTICS} ${META_PIXEL_BEACON} ${GOOGLE_THUMBNAILS}`,
  "font-src 'self' data:",
  // apis.google.com is in connect-src (not just script-src) because
  // gapi.load('picker', ...) fetches its module config from there, not just
  // a script tag — unverified against a live API key, but cheap insurance
  // against a CSP violation nobody would think to look for.
  `connect-src 'self'${isDev ? " ws: wss:" : ""} ${MIDTRANS_APP} ${MIDTRANS_API} ${GA_TAGMANAGER} ${GA_ANALYTICS} ${META_PIXEL_SCRIPT} ${META_PIXEL_BEACON} ${GOOGLE_DRIVE_API} ${GOOGLE_IDENTITY} ${GOOGLE_APIS}`,
  `frame-src ${MIDTRANS_APP} ${GOOGLE_PICKER_FRAME}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is ignored by browsers over plain http, so it's safe to send always.
  // No `preload` — that's effectively irreversible; add it deliberately later.
  ...(isDev ? [] : [{
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  }]),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "3000-firebase-ai-chatbot-1780037291743.cluster-fdkw7vjj7bgguspe3fbbc25tra.cloudworkstations.dev",
  ],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  images: {
    // TODO: INFO — verify AVIF advisory exposure and update Next.js/Sharp to patched versions; keep remotePatterns restricted.
    //
    // Empty, and deliberately kept rather than deleted: an empty list is the
    // strictest setting — next/image will optimize nothing from a remote host —
    // and leaving the key here is what stops the next remote image from being
    // added without a line saying which feature needs it. The one entry it held
    // was the YouTube thumbnail; see the note beside the CSP block above.
    remotePatterns: [],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
