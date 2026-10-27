"use client";

import { sendGAEvent } from "@next/third-parties/google";
import { hasAnalyticsConsent, isAnalyticsOptedOut } from "./analytics-optout";
import type { CtaLocation } from "./cta";

// sessionStorage flag: this tab has already reported its demo Lead to Meta.
const LEAD_SENT_KEY = "meta-lead-sent";

/** Which of the three levels in the CTA hierarchy was clicked. */
export type CtaAction =
  | "demo_whatsapp"   // primary: schedule a 15-minute demo
  | "try_demo"        // secondary: scroll to the in-page demo chat
  | "register"        // tertiary text link: sign up
  | "login";

/**
 * Report a CTA click to both analytics backends, once, from one place.
 *
 * Three backends because they answer different questions: Umami is per-route
 * and needs no cookie banner, GA4 is where the rest of the funnel lives. Reporting from one helper is what stops
 * a new button being wired to one of them and not the other.
 *
 * Consent and opt-out are checked here rather than at each call site:
 *   - GA4 only fires when the visitor accepted the cookie banner, matching what
 *     <AnalyticsConsent /> does for page views.
 *   - Umami's custom events pass through the same beforeSend as everything else
 *     (see <UmamiAnalytics />), so the /analytics-optout switch already covers
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
    // Cookieless (see <UmamiAnalytics />), so not behind the banner. Absent
    // when the script is blocked or not loaded yet; the click still counts in GA4.
    window.umami?.track("cta_click", { action, location, ...extra });
    if (hasAnalyticsConsent()) {
      sendGAEvent("event", "cta_click", { action, location, ...extra });
      // Meta Pixel goes through trackMeta, so its consent and opt-out rule
      // lives in one place. trackCustom, not track: "cta_click" is not one of
      // Meta's standard events, and passing a non-standard name to track()
      // makes it unusable as a campaign optimisation goal in Ads Manager.
      trackMeta("trackCustom", "cta_click", { action, location, ...extra });
      // Asking for the 15-minute demo is the conversion the ads exist to buy,
      // so it also goes out as Meta's standard Lead, the event Ads Manager can
      // optimise a campaign towards. cta_click above stays as the per-placement
      // breakdown; `location` carries that breakdown onto Lead as well.
      //
      // At most once per browser session. The same visitor commonly taps the
      // nav button, then the hero one, then the floating one; the Pixel does not
      // deduplicate without an eventID, so each tap would be a separate Lead and
      // Ads Manager would optimise towards, and report a cost per lead from, a
      // number several times the real one. The flag is only set when trackMeta
      // reports the event actually went out, so a click that never reached
      // Meta does not use up the session's Lead.
      if (action === "demo_whatsapp" && sessionStorage.getItem(LEAD_SENT_KEY) !== "1") {
        if (trackMeta("track", "Lead", { content_name: "demo_whatsapp", location })) {
          sessionStorage.setItem(LEAD_SENT_KEY, "1");
        }
      }
    }
  } catch {
    /* Analytics must never interrupt a click that is about to navigate. */
  }
}

/**
 * A Meta Pixel event that is not a CTA click: the email lead form, demo chat
 * usage, the ROI calculator. Same consent and opt-out gate as trackCta, and the
 * same promise never to throw.
 *
 * Params are counts and fixed labels only. Never pass what the visitor typed
 * (their email, their demo question): the privacy policy promises Meta gets the
 * page and the button, not the content, and event params reach Meta verbatim.
 *
 * Returns whether the event actually went to Meta, for callers that report
 * something only once and must not mark it done when nothing was sent.
 */
export function trackMeta(
  kind: "track" | "trackCustom",
  name: string,
  params: Record<string, string | number> = {},
): boolean {
  try {
    if (isAnalyticsOptedOut()) return false;
    if (!hasAnalyticsConsent()) return false;
    // fbq only exists once <MetaPixel /> has re-rendered after Terima, so an
    // event fired in the same tick as the accept is dropped, and reported as
    // not sent. Deliberately not fixed by defining a queueing fbq stub up
    // front: that would put a Meta-shaped object on the page before consent,
    // and blur the one boundary this whole file exists to hold. Callers that
    // need to know (the once-only Lead, the ROI latch) use the return value.
    if (!window.fbq) return false;
    window.fbq(kind, name, params);
    return true;
  } catch {
    /* Same rule as trackCta: analytics never interrupts the page. */
    return false;
  }
}
