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
const CONTENT = {
  id: {
    text: "Kami memakai cookie untuk autentikasi dan preferensi Anda.",
    more: "Selengkapnya",
    accept: "Terima",
    decline: "Tolak",
  },
  en: {
    text: "We use cookies for authentication and your preferences.",
    more: "Learn more",
    accept: "Accept",
    decline: "Decline",
  },
};

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
    // Read browser storage only after the matching server/client first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(!hasConsent);
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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 sm:justify-between">
        <p className="text-xs text-stone-600">
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
