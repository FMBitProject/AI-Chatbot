"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useLang } from "@/lib/language-context";
import { demoWhatsappUrl } from "@/lib/cta";
import { trackCta } from "@/lib/cta-analytics";

// Kept at this filename because the root layout imports it, and the name is
// finally accurate: this used to be an email bubble wearing a WhatsApp
// component's name. It opened a panel whose entire content was one mailto link,
// so it cost a tap, covered the corner of every page, and led somewhere the
// footer already goes.
//
// Now it is the primary CTA in its smallest form: one tap, straight to
// WhatsApp, no panel.
const LABEL = {
  id: "Jadwalkan demo lewat WhatsApp",
  en: "Book a demo on WhatsApp",
};

// Below this width the button is held back until the visitor has scrolled half
// the page. A floating circle in the thumb zone of a phone sits on top of the
// hero CTA and the top of the demo chat, which are the two things the first
// screen exists to offer — so on mobile it may only appear once those have been
// scrolled past. On a desktop viewport it floats in empty margin and covers
// nothing, so it is shown immediately.
const MOBILE_MAX_WIDTH = 640; // Tailwind's `sm`
const SCROLL_REVEAL_RATIO = 0.5;

// Where a sales CTA belongs, as an allow-list rather than a list of pages to
// hide it from.
//
// This mounts in the root layout, so before this guard it floated over /chat and
// /admin too: a paying hospital admin was being asked, inside their own
// workspace, to book a demo of the product they already own — and with the panel
// gone, one stray tap in the chat corner now jumps straight out to WhatsApp.
//
// An allow-list and not a deny-list, because the failure modes are not
// symmetrical. A new marketing page missing from this list loses one entry point
// nobody notices; a new authenticated route missing from a deny-list ships a
// sales pitch into the product.
const MARKETING_PATHS = ["/", "/pricing", "/roi", "/blog", "/industri", "/solusi"];

function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
}

export function WhatsAppButton() {
  const { lang } = useLang();
  const pathname = usePathname();
  const onMarketingPage = isMarketingPath(pathname);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // No setState here on purpose: the render already returns null off a
    // marketing page, so writing `false` would only be a cascading render for a
    // value nothing reads. Coming back to a marketing page re-runs this effect
    // and measures again.
    if (!onMarketingPage) return;
    const desktop = window.matchMedia(`(min-width: ${MOBILE_MAX_WIDTH}px)`);
    // Coalesced into one animation frame. `scrollHeight` is a layout-forcing
    // read, and calling it straight from the scroll handler made the browser
    // recompute layout on every scroll event — on phones, which is the only
    // place this calculation is even needed, and the slowest hardware it runs
    // on. The flag keeps at most one read per frame.
    let queued = false;

    const measure = () => {
      queued = false;
      if (desktop.matches) {
        setVisible(true);
        return;
      }
      // Guard the division: a page shorter than the viewport has no scrollable
      // distance, and 0/0 is NaN — which compares false against everything and
      // would leave the button permanently hidden on a short page.
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setVisible(scrollable <= 0 ? true : window.scrollY / scrollable >= SCROLL_REVEAL_RATIO);
    };

    const update = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    measure();
    // Passive: this only reads scroll position and never calls preventDefault,
    // so telling the browser that up front keeps it off the scrolling path.
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    desktop.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      desktop.removeEventListener("change", update);
    };
  }, [onMarketingPage]);

  if (!onMarketingPage || !visible) return null;

  return (
    <a
      href={demoWhatsappUrl(lang, "floating")}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackCta("demo_whatsapp", "floating")}
      aria-label={LABEL[lang]}
      title={LABEL[lang]}
      // bottom-20 on mobile clears the slim cookie bar while it is still up;
      // once dismissed the gap simply reads as margin.
      className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg transition-transform hover:scale-105 hover:bg-teal-800 active:scale-95 sm:bottom-6 sm:right-6"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
