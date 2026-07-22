"use client";
import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";

// Loads Google Analytics 4 only after the visitor accepts cookies via
// <CookieConsent />. The consent value lives in localStorage["cookie-consent"];
// CookieConsent dispatches a "cookie-consent-changed" event on accept so GA can
// start within the same session without a page reload (App Router navigations
// don't remount this component). The "storage" listener covers accept in
// another tab. If NEXT_PUBLIC_GA_ID is unset, this renders nothing.
export function AnalyticsConsent() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (!gaId) return;

    const check = () =>
      setConsented(localStorage.getItem("cookie-consent") === "accepted");
    check();

    window.addEventListener("cookie-consent-changed", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("cookie-consent-changed", check);
      window.removeEventListener("storage", check);
    };
  }, [gaId]);

  if (!gaId || !consented) return null;

  return <GoogleAnalytics gaId={gaId} />;
}
