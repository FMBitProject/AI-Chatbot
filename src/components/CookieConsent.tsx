"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Cookie } from "lucide-react";

export function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("cookie-consent");
  });

  function accept() {
    localStorage.setItem("cookie-consent", "accepted");
    // Let <AnalyticsConsent /> start GA immediately, without a page reload.
    window.dispatchEvent(new Event("cookie-consent-changed"));
    setVisible(false);
  }

  function decline() {
    localStorage.setItem("cookie-consent", "declined");
    window.dispatchEvent(new Event("cookie-consent-changed"));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-stone-200 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Cookie className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
        <p className="text-sm text-stone-600 flex-1">
          Kami menggunakan cookie untuk autentikasi dan menyimpan preferensi Anda.{" "}
          <Link href="/privacy" className="text-teal-700 hover:underline">Pelajari lebih lanjut</Link>.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={decline} className="text-xs">Tolak</Button>
          {/* No colour override: Button's own `default` variant is already
              teal-700/teal-800, and this banner mounts on every page (root
              layout) - it is the first thing a fresh visitor sees, so it
              cannot be the one place still carrying the old blue. */}
          <Button size="sm" onClick={accept} className="text-xs">Terima Semua</Button>
        </div>
      </div>
    </div>
  );
}
