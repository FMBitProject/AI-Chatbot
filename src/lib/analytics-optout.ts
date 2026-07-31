// Lets us exclude our own visits from analytics. Visiting /analytics-optout and
// switching the toggle on sets this flag; both Vercel Web Analytics (via
// beforeSend in <VercelAnalytics />) and GA4 (via <AnalyticsConsent />) then
// stop reporting from that browser. The flag is per browser/device, so it has
// to be set once on each one we test from — there is no server-side IP filter
// on Vercel Analytics to do this for us.
export const ANALYTICS_OPT_OUT_KEY = "analytics-opt-out";

export function isAnalyticsOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  // Guarded: this runs inside the analytics script's beforeSend callback, and
  // localStorage throws in some privacy modes.
  try {
    return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === "true";
  } catch {
    return false;
  }
}
