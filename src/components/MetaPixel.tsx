"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { isAnalyticsOptedOut } from "@/lib/analytics-optout";

// Meta (Facebook) Pixel, for attributing signups back to the Meta Ads that are
// running now. Gated exactly like <AnalyticsConsent />: nothing loads until the
// visitor presses Terima on <CookieConsent />, and never on a browser that
// opted out at /analytics-optout. If NEXT_PUBLIC_META_PIXEL_ID is unset, this
// renders nothing, so a missing env var is a no-op rather than a broken page.
//
// Two things differ from GA4, both because @next/third-parties has no Meta
// helper and we load the vendor snippet ourselves:
//
//  1. The snippet's own PageView only fires when the script first loads. App
//     Router navigations are client-side, so every route after the landing page
//     would be invisible — hence the pathname effect below. The `loaded` flag
//     is what stops it double-counting the very first view, which the snippet
//     already sent.
//  2. There is no <noscript> fallback pixel. It cannot be consent-gated (no
//     JavaScript means no way to read the consent flag), so it would fire for
//     visitors who never accepted cookies. Losing the no-JS visitors from the
//     numbers is the cheaper mistake.
export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!pixelId) return;

    const check = () => {
      try {
        setEnabled(
          localStorage.getItem("cookie-consent") === "accepted" &&
            !isAnalyticsOptedOut()
        );
      } catch {
        setEnabled(false);
      }
    };
    check();

    window.addEventListener("cookie-consent-changed", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("cookie-consent-changed", check);
      window.removeEventListener("storage", check);
    };
  }, [pixelId]);

  useEffect(() => {
    if (!enabled || !loaded) return;
    // Skipped for the view the snippet itself reported; see note 1 above.
    window.fbq?.("track", "PageView");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!pixelId || !enabled) return null;

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      onLoad={() => setLoaded(true)}
      dangerouslySetInnerHTML={{
        __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(pixelId)});
fbq('track', 'PageView');
        `,
      }}
    />
  );
}
