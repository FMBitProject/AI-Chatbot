"use client";

import { track } from "@vercel/analytics";
import { sendGAEvent } from "@next/third-parties/google";
import { isAnalyticsOptedOut } from "./analytics-optout";
import type { CtaLocation } from "./cta";

/** Which of the three levels in the CTA hierarchy was clicked. */
export type CtaAction =
  | "demo_whatsapp"   // primary: schedule a 15-minute demo
  | "try_demo"        // secondary: scroll to the in-page demo chat
  | "register"        // tertiary text link: sign up
  | "login";

/**
 * Report a CTA click to both analytics backends, once, from one place.
 *
 * Two backends because the site already runs two and they answer different
 * questions: Vercel Web Analytics is per-route and needs no cookie banner, GA4
 * is where the rest of the funnel lives. Reporting from one helper is what stops
 * a new button being wired to one of them and not the other.
 *
 * Consent and opt-out are checked here rather than at each call site:
 *   - GA4 only fires when the visitor accepted the cookie banner, matching what
 *     <AnalyticsConsent /> does for page views.
 *   - Vercel's custom events pass through the same beforeSend as everything else
 *     (see <VercelAnalytics />), so the /analytics-optout switch already covers
 *     them. It is checked again here anyway, because a dropped event is cheaper
 *     than one that escapes if that wiring ever changes.
 *
 * Never throws and never blocks. It is called from click handlers that are about
 * to navigate, so an analytics failure must not be able to stop the navigation —
 * the entire body is wrapped, including the reads of localStorage, which throw
 * on their own in some privacy modes.
 */
export function trackCta(
  action: CtaAction,
  location: CtaLocation,
  // Extra properties for placements that carry context worth keeping. The demo
  // CTA sends `questions_sent`, which is the difference between "saw the demo"
  // and "used the demo three times and then asked to talk" — the two visitors
  // this funnel most needs to tell apart.
  extra: Record<string, string | number> = {},
): void {
  try {
    if (isAnalyticsOptedOut()) return;
    track("cta_click", { action, location, ...extra });
    // TODO: MINOR — "cookie-consent" is written as a literal in three files
    // (here, CookieConsent.tsx, DemoChat.tsx). Give it a shared constant next to
    // ANALYTICS_OPT_OUT_KEY.
    if (localStorage.getItem("cookie-consent") === "accepted") {
      sendGAEvent("event", "cta_click", { action, location, ...extra });
    }
  } catch {
    /* Analytics must never interrupt a click that is about to navigate. */
  }
}
