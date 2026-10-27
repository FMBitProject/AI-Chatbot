// Lets us exclude our own visits from analytics. Visiting /analytics-optout and
// switching the toggle on sets this flag; Umami (via data-before-send in
// <UmamiAnalytics />), GA4 (via <AnalyticsConsent />) and the Meta Pixel then
// stop reporting from that browser. The flag is per browser/device, so it has
// to be set once on each one we test from.
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

// The cookie banner's answer: "accepted" | "declined", absent until answered.
// Versioned, because the key IS the question. Until 2026-10-13 the banner said
// cookies were for "autentikasi dan preferensi" and never mentioned analytics or
// ads, so an "accepted" stored under the old "cookie-consent" key was agreement
// to something else. Bumping the key re-asks everyone once; bump it again
// whenever the banner starts asking for something new.
export const COOKIE_CONSENT_KEY = "cookie-consent-v2";

/** True only when the visitor pressed Terima on the current banner. */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}
