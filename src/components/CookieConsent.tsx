"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLang } from "@/lib/language-context";

// One line, and short enough to stay one line. This was a padded block spanning
// the full width with an icon, a two-clause sentence and two buttons, which on a
// phone took roughly a fifth of the first screen — directly over the hero CTA
// and the top of the demo chat, the two things that screen exists to offer.
//
// Also bilingual now. It was Indonesian-only while every other surface followed
// the language toggle, so an English visitor's first interaction with the site
// was a consent notice they could not read — the one notice where being
// understood is the entire point.
//
// Short enough to actually fit two lines beside the buttons at 375px, which is
// the whole point of the one-row layout below: with the text column ~205px
// wide, every character past roughly 62 buys a third line and ~17px of bar.
// "Anda" / "your" was carrying no legal or plain-language weight and cost
// exactly that.
const CONTENT = {
  id: {
    text: "Kami memakai cookie untuk autentikasi dan preferensi.",
    more: "Selengkapnya",
    accept: "Terima",
    decline: "Tolak",
  },
  en: {
    text: "We use cookies for authentication and preferences.",
    more: "Learn more",
    accept: "Accept",
    decline: "Decline",
  },
};

// Below this width the banner is held back until the visitor has scrolled past
// roughly the first screen. Exactly the rule <WhatsAppButton /> already follows,
// and for the same reason: a bar pinned to the bottom of a 375px viewport lands
// on the hero's CTA, which is the one thing that screen exists to offer. A
// visitor who has to read around a consent bar to find "Coba Demo Langsung" is
// being asked about cookies before being told what the product is.
//
// Nothing is being deferred except the *asking*. No cookie is set and no
// analytics loads until someone presses Terima — <AnalyticsConsent /> and
// trackCta both gate on the stored value, and an unanswered banner reads as no
// consent — so a banner that appears one screen later is not a banner that
// tracked anyone in the meantime. What it costs is the visitor who bounces from
// the first screen without scrolling: they are never asked, which is the
// correct outcome for someone we are also not tracking.
//
// On a desktop viewport it is a single thin line across the bottom of a wide
// window, covering nothing, so it appears immediately.
//
// The rule is "hold back until there is something to hold back *from*", not
// "hold back until scrolled". This component mounts in the root layout, so it
// runs on every route — including /chat, which is `h-screen overflow-hidden`
// with its own inner scroll container and therefore has window.scrollY pinned
// at 0 forever, and /login, /register and /payment/*, which are short enough
// that a 375px phone never reaches the threshold either. Gating on scroll alone
// meant the consent notice could never appear on any of them: nobody is asked,
// nothing is stored, and GA4 can never switch on for that visitor. A page with
// no room to scroll gets the banner straight away.
const MOBILE_MAX_WIDTH = 640; // Tailwind's `sm`
const SCROLL_REVEAL_RATIO = 0.6;

export function CookieConsent() {
  const { lang } = useLang();
  const T = CONTENT[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hasConsent = false;
    try {
      hasConsent = !!localStorage.getItem("cookie-consent");
    } catch {
      // Storage can be disabled; the banner must still be dismissible.
    }
    if (hasConsent) return;

    const desktop = window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH}px)`);
    // Coalesced into one animation frame, copied from WhatsAppButton: innerHeight
    // and scrollY off a raw scroll handler make the browser recompute layout on
    // every scroll event, on phones, which is the only place this runs.
    let queued = false;
    // Once shown, it stays shown. Without the latch, scrolling back up to the
    // hero takes the banner away again, so the visitor gets a bar that appears
    // and disappears as they move — which reads as a glitch, and means someone
    // reaching for "Terima" can have it vanish under their thumb.
    let shown = false;

    const measure = () => {
      queued = false;
      // TODO: MINOR — begitu `shown` true, ketiga listener + observer tidak akan
      // pernah dibutuhkan lagi, tapi tetap terpasang sampai tab ditutup karena
      // komponen ini ada di root layout dan tak pernah unmount. Lepas di sini.
      if (shown) return;
      // A page with no scrollable distance can never satisfy any scroll
      // threshold, so waiting on one there means never asking at all. Erring
      // towards showing is the only safe direction for a consent notice.
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (
        desktop.matches ||
        scrollable <= 0 ||
        window.scrollY >= window.innerHeight * SCROLL_REVEAL_RATIO
      ) {
        shown = true;
        setVisible(true);
      }
    };

    const update = () => {
      if (queued) return;
      queued = true;
      // TODO: MINOR — rAF yang tertunda tidak pernah di-cancelAnimationFrame
      // pada cleanup, jadi `measure` bisa berjalan satu frame setelah unmount.
      // Tidak berbahaya (setState pasca-unmount adalah no-op di React 19), tapi
      // simpan id-nya dan batalkan.
      requestAnimationFrame(measure);
    };

    // Scroll and resize are not enough on their own: a page with nothing to
    // scroll emits neither, and document height is still moving while fonts and
    // the hero screenshots load — which is exactly when `scrollable <= 0` can
    // read true and then stop being true. Watching the body covers both, and it
    // fires once on observe, which is also the initial measurement.
    //
    // Measured after the first render, never during it: viewport width, scroll
    // position and document height are browser-only values, and seeding state
    // from them during render is a hydration mismatch rather than a shortcut.
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (observer) observer.observe(document.body);
    else measure();

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    desktop.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  function saveConsent(value: "accepted" | "declined") {
    try {
      localStorage.setItem("cookie-consent", value);
      window.dispatchEvent(new Event("cookie-consent-changed"));
    } catch {
      // Without persisted consent, analytics stays disabled.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    // Unchanged behaviour, smaller footprint: still the same two choices writing
    // the same localStorage key and firing the same event, so <AnalyticsConsent />
    // and the GA gating in trackCta keep working exactly as before.
    //
    // role="region" with a label rather than role="dialog": this traps nothing
    // and the page stays fully usable behind it, and announcing a modal that is
    // not modal is worse than announcing nothing.
    <div
      role="region"
      aria-label={T.text}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
    >
      {/* Text and buttons on one row at every width, not wrapped.
          `flex-wrap` read as the safe choice and was the expensive one: at
          375px the sentence needs two lines, which pushes the button pair onto
          a third row of its own — two lines of text plus a button row plus the
          row gap, about 83px, an eighth of an iPhone SE screen. Side by side the
          buttons cost no row of their own, so the bar is as tall as the text
          column alone.

          Arithmetic rather than a guess, because the first version of this
          comment claimed "two lines" without doing it: at 375px the text column
          is 375 − 32 (px-4) − 12 (gap-x-3) − ~126 (two h-7 px-3 buttons and
          their gap) ≈ 205px. Two lines of 12px text only fits a string of about
          62 characters including "Selengkapnya", which is what CONTENT above is
          now written to, and lands the bar near 50px. Lengthen that copy and
          the third line — and ~17px — comes straight back.

          min-w-0 is what makes any of it work: a flex item will not shrink
          below the width of its longest word without it, so the text column
          would push the buttons off the edge instead of wrapping. shrink-0 on
          the buttons says the give comes from the text, never from the tap
          targets. */}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-x-3 px-4 py-2">
        <p className="min-w-0 text-xs leading-snug text-stone-600">
          {T.text}{" "}
          <Link href="/privacy" className="text-teal-700 underline underline-offset-2 hover:text-teal-800">
            {T.more}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => saveConsent("declined")} className="h-7 px-3 text-xs">
            {T.decline}
          </Button>
          {/* No colour override: Button's `default` variant is already
              teal-700/teal-800, and this mounts on every page, so it cannot be
              the one place still carrying the old blue. */}
          <Button size="sm" onClick={() => saveConsent("accepted")} className="h-7 px-3 text-xs">
            {T.accept}
          </Button>
        </div>
      </div>
    </div>
  );
}
