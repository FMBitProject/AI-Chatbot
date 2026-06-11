"use client";
import { useState } from "react";
import { Mail, X } from "lucide-react";
import { useLang } from "@/lib/language-context";

const SUPPORT_EMAIL = "intellibaseaisupport@gmail.com";

export function WhatsAppButton() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);

  const subject = lang === "en"
    ? "Help with IntelliBase AI"
    : "Bantuan IntelliBase AI";

  const mailUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-72 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-teal-600 flex items-center justify-center">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">IntelliBase Support</p>
                <p className="text-xs text-gray-400">{SUPPORT_EMAIL}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 mb-3">
            <p className="text-sm text-gray-700 leading-relaxed">
              {lang === "en"
                ? "👋 Hi! Need help with IntelliBase? Send us an email and we'll get back to you shortly."
                : "👋 Halo! Butuh bantuan dengan IntelliBase? Kirim email ke kami dan kami akan segera membalas."}
            </p>
          </div>
          <a
            href={mailUrl}
            className="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
            onClick={() => setOpen(false)}
          >
            <Mail className="h-4 w-4" />
            {lang === "en" ? "Send Email" : "Kirim Email"}
          </a>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="h-14 w-14 rounded-full bg-teal-600 hover:bg-teal-700 shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Email Support"
      >
        {open
          ? <X className="h-6 w-6 text-white" />
          : <Mail className="h-7 w-7 text-white" />
        }
      </button>
    </div>
  );
}
