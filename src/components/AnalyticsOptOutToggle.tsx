"use client";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ANALYTICS_OPT_OUT_KEY, isAnalyticsOptedOut } from "@/lib/analytics-optout";

// The flag only changes on this page, and toggling reloads, so there is nothing
// to subscribe to. useSyncExternalStore is here for its server snapshot, which
// keeps a localStorage read from mismatching during hydration.
const subscribe = () => () => {};
const serverSnapshot = () => false;

export function AnalyticsOptOutToggle() {
  const optedOut = useSyncExternalStore(subscribe, isAnalyticsOptedOut, serverSnapshot);

  function toggle() {
    if (optedOut) {
      localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    } else {
      localStorage.setItem(ANALYTICS_OPT_OUT_KEY, "true");
    }
    // Reload rather than re-render: GA4's gtag script keeps reporting once
    // injected, so a fresh load is the only way to actually stop it mid-session.
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className={`text-sm font-medium ${optedOut ? "text-teal-700" : "text-gray-600"}`}>
        {optedOut
          ? "Kunjungan dari browser ini TIDAK dihitung."
          : "Kunjungan dari browser ini masih dihitung."}
      </p>
      <Button variant={optedOut ? "outline" : "default"} onClick={toggle}>
        {optedOut ? "Hitung lagi kunjungan saya" : "Jangan hitung kunjungan saya"}
      </Button>
    </div>
  );
}
