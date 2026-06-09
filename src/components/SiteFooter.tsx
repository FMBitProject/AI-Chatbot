import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { version } from "../../package.json";

const LINKS = [
  { href: "/pricing", labelId: "Harga", labelEn: "Pricing" },
  { href: "/login",   labelId: "Masuk",  labelEn: "Sign In" },
  { href: "/register",labelId: "Daftar", labelEn: "Register" },
  { href: "/terms",   labelId: "Syarat", labelEn: "Terms" },
  { href: "/privacy", labelId: "Privasi",labelEn: "Privacy" },
];

export function SiteFooter({ lang = "id" }: { lang?: "id" | "en" }) {
  return (
    <footer className="border-t py-8 px-6 bg-white">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 pr-24">
        <LogoFull size="sm" />
        <p className="text-gray-400 text-sm">© 2026 IntelliBase AI. All rights reserved. &nbsp;·&nbsp; v{version}</p>
        <div className="flex flex-wrap gap-5 text-sm text-gray-400">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-gray-600 transition-colors">
              {lang === "en" ? l.labelEn : l.labelId}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
