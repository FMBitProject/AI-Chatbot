"use client";
import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language-context";

// The chrome only — navbar and footer. It is a Client Component because the
// language switcher and `useLang` need to be, and the whole marketing surface
// shares that navbar.
//
// `children` is rendered by the Server Component that uses this shell and passed
// through as an already-rendered tree, so the article itself never becomes part
// of the client bundle. That is the point of splitting the two: the chrome is
// interactive, the prose is not.
//
// Chrome is bilingual like every other public page. Article bodies are not —
// they are written in Indonesian for readers searching in Indonesian, the same
// choice /solusi/rumah-sakit makes. A half-translated article is worse than an
// untranslated one, so the switcher is honest about only changing the frame.
const CONTENT = {
  id: { roi: "Kalkulator ROI", price: "Harga", login: "Masuk", start: "Mulai Gratis", blog: "Blog" },
  en: { roi: "ROI Calculator", price: "Pricing", login: "Sign In", start: "Start Free", blog: "Blog" },
};

export function BlogShell({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  const T = CONTENT[lang];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link href="/"><LogoFull size="sm" className="shrink-0" /></Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/blog" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.blog}</Link>
            <Link href="/roi" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.roi}</Link>
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.price}</Link>
            <Link href="/login"><Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.login}</Button></Link>
            <Link href="/register"><Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">{T.start}</Button></Link>
          </div>
        </div>
      </nav>

      {/* flex-1 so the footer sits at the bottom of the viewport on a short
          page — the index will be short until there are more than a few posts. */}
      <main className="flex-1">{children}</main>

      <SiteFooter lang={lang} />
    </div>
  );
}
