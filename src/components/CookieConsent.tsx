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
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Cookie className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600 flex-1">
          Kami menggunakan cookie untuk autentikasi dan menyimpan preferensi Anda.{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">Pelajari lebih lanjut</Link>.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={decline} className="text-xs">Tolak</Button>
          <Button size="sm" onClick={accept} className="bg-blue-600 hover:bg-blue-700 text-xs">Terima Semua</Button>
        </div>
      </div>
    </div>
  );
}
