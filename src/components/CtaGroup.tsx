"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language-context";
import { cn } from "@/lib/utils";
import { DEMO_SECTION_ID, demoWhatsappUrl, scrollToDemo, type CtaLocation } from "@/lib/cta";
import { trackCta } from "@/lib/cta-analytics";

// One wording for the whole page. The landing page previously offered "Mulai
// Gratis", "Konsultasi gratis", an email link, a WhatsApp link, a "leave your
// email" form and a chat bubble, several of them twice — six competing asks,
// which is the reliable way to have a visitor choose none of them.
//
// Three levels, in descending commitment, and they are weighted so the eye
// ranks them without reading: a filled button, an outlined button, a text link.
const CONTENT = {
  id: {
    primary: "Jadwalkan Demo 15 Menit",
    secondary: "Coba Demo Langsung",
    tertiary: "Daftar gratis untuk tim kecil",
  },
  en: {
    primary: "Book a 15-Minute Demo",
    secondary: "Try the Live Demo",
    tertiary: "Sign up free for small teams",
  },
};

type CtaGroupProps = {
  /** Which placement this is. Travels into the WhatsApp message and both analytics backends. */
  location: CtaLocation;
  /**
   * Dark sections invert the button treatment. Passed explicitly rather than
   * inferred from a CSS variable so a section that changes background does not
   * silently ship white-on-white.
   */
  tone?: "light" | "dark";
  className?: string;
};

export function CtaGroup({ location, tone = "light", className }: CtaGroupProps) {
  const { lang } = useLang();
  const T = CONTENT[lang];
  const dark = tone === "dark";

  // The secondary button is rendered only if there is something to scroll to.
  //
  // scrollToDemo() returns silently when #demo-chat is absent, which is correct
  // for the function and wrong for the button: on any page that uses this
  // component without the demo section — and it is written to be reused — the
  // visitor would get a button that looks live, takes the click, and does
  // nothing, with no error anywhere. Better to not offer it.
  //
  // Measured after mount rather than during render, because the server has no
  // DOM to query and rendering the button on the server and not on the client is
  // a hydration mismatch.
  const [hasDemoSection, setHasDemoSection] = useState(false);
  useEffect(() => {
    // Deliberate, and the same pattern the cookie banner and the pricing page
    // already use: this is a browser-only value that the first render cannot
    // know. Reading it into the initial state instead would render the button on
    // the client against the nothing the server prerendered, which is a
    // hydration mismatch rather than a fix.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasDemoSection(!!document.getElementById(DEMO_SECTION_ID));
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        {/* Primary. An anchor, not a button with an onClick navigation: this
            opens WhatsApp, and a real link is what lets someone long-press it,
            open it in another tab, or copy it. The tracking rides along on the
            click instead of replacing the navigation. */}
        <Button
          asChild
          size="lg"
          className={cn(
            "h-12 gap-2 px-8 font-semibold active:scale-[0.98]",
            dark ? "bg-white text-teal-900 hover:bg-teal-50" : "bg-teal-700 text-white hover:bg-teal-800",
          )}
        >
          <a
            href={demoWhatsappUrl(lang, location)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCta("demo_whatsapp", location)}
          >
            <MessageCircle className="h-5 w-5" />
            {T.primary}
          </a>
        </Button>

        {hasDemoSection && (
          // Secondary. A button rather than an <a href="#demo-chat">: the anchor
          // would push a fragment into the history, so every press of it costs
          // the visitor one press of the back button before they can leave.
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => {
              trackCta("try_demo", location);
              scrollToDemo();
            }}
            className={cn(
              "h-12 gap-2 px-8 active:scale-[0.98]",
              dark
                ? "border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white"
                : "border-hairline bg-raised text-stone-800 hover:bg-stone-100 hover:text-stone-900",
            )}
          >
            {T.secondary}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tertiary, and deliberately not a button. Self-serve signup is the right
          path for a small team and the wrong first step for a hospital, which is
          the visitor this page is written for. Leaving it as text keeps it
          available without letting it compete. */}
      <Link
        href="/register"
        onClick={() => trackCta("register", location)}
        className={cn(
          "text-sm font-medium underline underline-offset-4",
          dark
            ? "text-teal-100 decoration-teal-100/40 hover:text-white"
            : "text-teal-800 decoration-teal-300 hover:text-teal-900",
        )}
      >
        {T.tertiary}
      </Link>
    </div>
  );
}
