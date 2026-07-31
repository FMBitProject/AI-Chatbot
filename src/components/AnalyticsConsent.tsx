"use client";
import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { isAnalyticsOptedOut } from "@/lib/analytics-optout";

// Loads Google Analytics 4 only after the visitor accepts cookies via
// <CookieConsent />, and never on a browser that opted out at
// /analytics-optout (that page reloads on toggle, because an already-injected
// gtag keeps reporting even if this component stops rendering it).
// The consent value lives in localStorage["cookie-consent"];
// CookieConsent dispatches a "cookie-consent-changed" event on accept so GA can
// start within the same session without a page reload (App Router navigations
// don't remount this component). The "storage" listener covers accept in
// another tab. If NEXT_PUBLIC_GA_ID is unset, this renders nothing.
export function AnalyticsConsent() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!gaId) return;

    const check = () =>
      setEnabled(
        localStorage.getItem("cookie-consent") === "accepted" &&
          !isAnalyticsOptedOut()
      );
    check();

    window.addEventListener("cookie-consent-changed", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("cookie-consent-changed", check);
      window.removeEventListener("storage", check);
    };
  }, [gaId]);

  if (!gaId || !enabled) return null;

  return <GoogleAnalytics gaId={gaId} />;
}
