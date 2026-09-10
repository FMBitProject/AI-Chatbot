import Link from "next/link";
import { LogoHomeLink } from "@/components/Logo";

const LINKS = [
  { href: "/blog",    labelId: "Blog",   labelEn: "Blog" },
  { href: "/roi",     labelId: "Kalkulator ROI", labelEn: "ROI Calculator" },
  { href: "/pricing", labelId: "Harga", labelEn: "Pricing" },
  { href: "/login",   labelId: "Masuk",  labelEn: "Sign In" },
  { href: "/register",labelId: "Daftar", labelEn: "Register" },
  { href: "/terms",   labelId: "Syarat", labelEn: "Terms" },
  { href: "/privacy", labelId: "Privasi",labelEn: "Privacy" },
];

export function SiteFooter({ lang = "id" }: { lang?: "id" | "en" }) {
  return (
    <footer className="border-t border-hairline py-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Safe to point home from here: this footer only ever renders on the
            marketing and auth pages (pricing, roi, terms, privacy, login,
            register, the hospital page) — never inside /chat or /admin, where
            "home" would mean the dashboard rather than the landing page. */}
        <LogoHomeLink size="sm" lang={lang} />
        {/* No build version here. A visitor reading a pricing page has no use
            for "v1.0.0", and a version string in a marketing footer is a
            devtool fixture wearing marketing clothes. It also put this footer
            and the landing page's own out of sync for no reason. The number is
            still in package.json for anyone who needs it. */}
        <p className="text-stone-500 text-sm">© 2026 IntelliBase AI. All rights reserved.</p>
        <div className="flex flex-wrap gap-5 text-sm text-stone-500">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-stone-900 transition-colors">
              {lang === "en" ? l.labelEn : l.labelId}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
