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

// Demo video embedded on the landing page. The player is framed from the
// privacy-friendly nocookie host and only mounts after a click, so no YouTube
// request happens on a plain page view. Its thumbnail is fetched server-side by
// next/image (see `images.remotePatterns`) and served from our own origin, so
// img-src needs no YouTube host.
const YOUTUBE_EMBED = "https://www.youtube-nocookie.com";

// No nonces: per the Next.js CSP guide, nonce-based CSP forces every page into
// dynamic rendering. 'unsafe-inline' keeps static optimization; the policy
// still blocks external script injection, exfiltration and framing.
// Dev needs 'unsafe-eval' (React error stacks) and ws: (HMR).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${MIDTRANS_APP} ${GA_TAGMANAGER}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${MIDTRANS_APP} ${GA_TAGMANAGER} ${GA_ANALYTICS}`,
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} ${MIDTRANS_APP} ${MIDTRANS_API} ${GA_TAGMANAGER} ${GA_ANALYTICS}`,
  `frame-src ${MIDTRANS_APP} ${YOUTUBE_EMBED}`,
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
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
  },
  // Don't bundle pdf-parse — its entry point runs debug code when module.parent
  // is falsy (Turbopack doesn't set it), which tries to open a test PDF file.
  // Marking it external lets Node.js require() it at runtime with module.parent set correctly.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
