"use client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { isAnalyticsOptedOut } from "@/lib/analytics-optout";

// Returning null drops the event before it leaves the browser. Declared at
// module scope on purpose: <Analytics /> re-registers this callback whenever
// its identity changes, so an inline arrow would re-register on every render.
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  return isAnalyticsOptedOut() ? null : event;
}

// Wraps Vercel Web Analytics so we can pass beforeSend — a function prop, which
// the root layout (a Server Component) cannot serialize across the boundary.
export function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
