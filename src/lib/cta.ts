import { whatsappUrl } from "./contact";
import type { Lang } from "./i18n";

/**
 * Where on the page a call to action was clicked.
 *
 * Not free text. The whole reason to track these is to answer "which placement
 * actually produces conversations", and that question dies the moment two
 * surfaces report the same click under "hero" and "Hero". A union means a new
 * placement has to be named here, and a typo is a build error rather than a
 * silently orphaned row in the dashboard.
 */
export type CtaLocation =
  | "nav"
  | "hero"
  | "pricing"
  | "closing"
  | "demo"
  | "floating";

/**
 * The WhatsApp link behind every primary CTA.
 *
 * The prefilled message carries the placement, and it does so in the message
 * body rather than only in an analytics event, because those two are visible to
 * different people. The analytics event tells us what happened; the message
 * tells whoever answers WhatsApp where this person was standing when they
 * decided to talk to us — which arrives even when analytics is blocked, opted
 * out, or simply not being read.
 *
 * The bracketed placeholder is deliberate and stays in the sent text. WhatsApp
 * opens with this prefilled but editable, so "[nama RS/klinik]" reads as a blank
 * the sender fills in. Replacing it with something neutral like "rumah sakit
 * kami" would produce a grammatical message that nobody edits, and the one fact
 * worth having before the first reply is which hospital is asking.
 */
export function demoWhatsappUrl(lang: Lang, location: CtaLocation): string {
  const message =
    lang === "en"
      ? `Hi, I'm from [hospital/clinic name], I'd like a demo of IntelliBase AI. (from: ${location})`
      : `Halo, saya dari [nama RS/klinik], ingin demo IntelliBase AI. (dari: ${location})`;
  return whatsappUrl(message);
}

/** The id of the demo chat section, which the secondary CTA scrolls to. */
export const DEMO_SECTION_ID = "demo-chat";

/**
 * Scroll to the demo chat rather than navigating to `#demo-chat`.
 *
 * A plain anchor jumps, and it also writes the fragment into the URL, so the
 * back button then walks the visitor through every CTA they pressed instead of
 * taking them off the page. Both are avoided here.
 *
 * `scrollIntoView` is called without smooth behaviour when the visitor has asked
 * for reduced motion: a full-page smooth scroll is exactly the kind of movement
 * that setting exists to stop.
 */
export function scrollToDemo(): void {
  const target = document.getElementById(DEMO_SECTION_ID);
  if (!target) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}
