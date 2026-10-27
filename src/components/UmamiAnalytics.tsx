"use client";
import Script from "next/script";
import { isAnalyticsOptedOut } from "@/lib/analytics-optout";

// Self-hosted Umami (stats.intellibaseai.com, on the same VPS as the app).
// It replaced Vercel Web Analytics when production left Vercel: that script is
// served from /_vercel/insights and exists only on Vercel's platform.
//
// Like Vercel's, Umami sets no cookie and stores nothing in the browser, so it
// loads without waiting for the cookie banner — the same footing the privacy
// policy gave Vercel Web Analytics. GA4 and the Meta Pixel are the ones that
// wait for consent.
const UMAMI_SCRIPT = "https://stats.intellibaseai.com/s.js";
const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number>) => void };
    umamiBeforeSend?: (type: string, payload: unknown) => unknown;
  }
}

// Umami calls the function named in data-before-send for every page view and
// event; a falsy return drops it in the browser. This is how the
// /analytics-optout switch keeps covering the cookieless counter.
if (typeof window !== "undefined") {
  window.umamiBeforeSend = (_type, payload) => (isAnalyticsOptedOut() ? null : payload);
}

export function UmamiAnalytics() {
  if (!WEBSITE_ID) return null;
  return (
    <Script
      src={UMAMI_SCRIPT}
      strategy="afterInteractive"
      data-website-id={WEBSITE_ID}
      // Only the production host is counted: previews, the old Vercel URL and
      // local dev load the same bundle and would otherwise pollute the numbers.
      data-domains="www.intellibaseai.com"
      data-before-send="umamiBeforeSend"
    />
  );
}
