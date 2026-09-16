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
 * One plain sentence, ready to send as it stands.
 *
 * It used to carry two pieces of machinery, and both of them leaked. A
 * bracketed blank, "[nama RS/klinik]", was meant to read as a field the sender
 * fills in; a trailing "(dari: hero)" carried the placement so that whoever
 * answers WhatsApp would know where the person was standing when they decided
 * to talk to us, even if analytics never reported it.
 *
 * Both assumed the prefill gets edited before it is sent. It does not. WhatsApp
 * opens with the message in the composer and the overwhelmingly common action
 * is to press send, so what actually reached the other end was square brackets
 * and an internal placement name — from a vendor asking a hospital to trust it
 * with its internal documents. A first message that looks like an unfinished
 * template is a worse opening than one that omits the hospital's name, which is
 * the first thing the reply will ask for anyway.
 *
 * The placement is not lost, only moved: every CTA still reports it through
 * `trackCta`. Read that function before concluding this costs attribution,
 * because the obvious assumption is wrong — Vercel Web Analytics is cookieless
 * and `track()` there fires whether or not the cookie banner has been answered,
 * so the placement of a click arrives for essentially every visitor. Only the
 * GA4 half waits for consent. What genuinely loses attribution is a visitor who
 * blocks analytics outright or has used /analytics-optout, and that visitor was
 * never going to be counted anywhere.
 *
 * `CtaLocation` below is unchanged and still the type every call site passes to
 * `trackCta`, so putting the placement back into the message text — and the
 * square brackets back into a stranger's WhatsApp — would be a change to this
 * one function. It should take more than a hunch about lost tracking.
 *
 * It names no institution, and that is the second thing this sentence got
 * wrong. "untuk rumah sakit kami" was written for the homepage, which leads
 * with hospitals; this link does not live only there. <WhatsAppButton /> floats
 * on /industri and /blog as well, where the reader may well be a factory or a
 * law firm — see MARKETING_PATHS — so a fixed noun is wrong for them outright,
 * and wrong for a clinic everywhere.
 *
 * "RS/klinik" is not the fix, tempting as it looks. A slash-list reads as a
 * field waiting to be picked from, which is the same thing the square brackets
 * did: it announces a template, and it still leaves out everyone the list does
 * not name. Dropping the noun costs nothing — the first reply asks who is
 * writing anyway — and leaves one sentence that is true for every visitor who
 * can reach this link.
 */
export function demoWhatsappUrl(lang: Lang): string {
  const message =
    lang === "en"
      ? "Hello, I'd like to schedule a demo of IntelliBase AI for our team."
      : "Halo, saya ingin menjadwalkan demo IntelliBase AI untuk tim kami.";
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
