"use client";
import { useLang } from "@/lib/language-context";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <div className={cn("flex items-center bg-gray-100 rounded-lg p-0.5", className)}>
      <button
        onClick={() => setLang("id")}
        className={cn(
          "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
          lang === "id"
            ? "bg-white text-teal-600 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        )}
      >
        ID
      </button>
      <button
        onClick={() => setLang("en")}
        className={cn(
          "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
          lang === "en"
            ? "bg-white text-teal-600 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        )}
      >
        EN
      </button>
    </div>
  );
}
