"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/lib/language-context";
import { INDUSTRIES, OTHER_INDUSTRIES, PRIMARY_INDUSTRY_KEY } from "@/lib/industries";
import { consultationMailto } from "@/lib/contact";
import { ArrowRight, Mail } from "lucide-react";

// "Cocok untuk", never "dipakai oleh": there are no customers in any of these
// industries to point at. The page claims only that the product fits their
// documents, which is what the document types under each name show.
const CONTENT = {
  id: {
    nav: { price: "Harga", login: "Masuk", start: "Mulai Gratis" },
    badge: "Di luar rumah sakit",
    title: "Juga Cocok untuk Industri Lain",
    desc: "Setiap industri punya istilah dokumennya sendiri. AI menjawab dari dokumen resmi Anda, apapun namanya, dan setiap jawaban menyebut dokumen sumbernya.",
    listNote: "Contoh jenis dokumen yang biasa diunggah di tiap industri.",
    hospitalLead: "Rumah sakit atau klinik?",
    hospitalLink: "Lihat solusi untuk rumah sakit",
    ctaTitle: "Coba dengan Dokumen Organisasi Anda Sendiri",
    ctaDesc: "Paket Starter gratis, tanpa kartu kredit. Kalau ragu memulai sendiri, kami bantu menyiapkannya.",
    ctaBtn1: "Mulai Gratis",
    ctaBtn2: "Konsultasi gratis",
  },
  en: {
    nav: { price: "Pricing", login: "Sign In", start: "Start Free" },
    badge: "Beyond hospitals",
    title: "Also Fits Other Industries",
    desc: "Every industry has its own document vocabulary. The AI answers from your official documents, whatever you call them, and every answer names its source.",
    listNote: "Examples of the documents each industry typically uploads.",
    hospitalLead: "A hospital or clinic?",
    hospitalLink: "See the hospital solution",
    ctaTitle: "Try It With Your Own Organisation's Documents",
    ctaDesc: "The Starter plan is free, no credit card. If you would rather not set it up alone, we will help.",
    ctaBtn1: "Start Free",
    ctaBtn2: "Free consultation",
  },
};

const HOSPITAL = INDUSTRIES.find((i) => i.key === PRIMARY_INDUSTRY_KEY);

export function IndustriesContent() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Same navbar shape as the landing and hospital pages. */}
      <nav className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link href="/"><LogoFull size="sm" className="shrink-0" /></Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/pricing" className="text-sm text-stone-500 hover:text-stone-800 font-medium hidden md:block">{T.nav.price}</Link>
            <Link href="/login"><Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.nav.login}</Button></Link>
            <Link href="/register"><Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-xs sm:text-sm px-3 sm:px-4">{T.nav.start}</Button></Link>
          </div>
        </div>
      </nav>

      <section className="py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 mb-3">{T.badge}</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.015em] text-stone-900 mb-4">{T.title}</h1>
          <p className="text-stone-600 max-w-2xl leading-relaxed">{T.desc}</p>

          {/* Columns under one rule rather than boxes, as on the homepage this
              came from: none of these entries is clickable, so nothing here
              should look raised off the paper. */}
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 border-t border-hairline pt-8 mt-10">
            {OTHER_INDUSTRIES.map((ind) => (
              <div key={ind.key}>
                <h2 className="font-semibold text-stone-900 mb-1">{ind.name[lang]}</h2>
                <p className="text-sm text-stone-500 leading-relaxed">{ind.docs[lang]}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-8">{T.listNote}</p>

          {HOSPITAL?.href && (
            <p className="text-sm text-stone-600 mt-10 border-t border-hairline pt-6">
              {T.hospitalLead}{" "}
              <Link href={HOSPITAL.href} className="font-medium text-teal-700 hover:text-teal-800 underline underline-offset-4 decoration-teal-300">
                {T.hospitalLink}
              </Link>
            </p>
          )}
        </div>
      </section>

      <section className="bg-teal-900 py-16 px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-white mb-4">{T.ctaTitle}</h2>
        <p className="text-teal-100 text-lg mb-8 max-w-2xl mx-auto">{T.ctaDesc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register"><Button size="lg" className="bg-white text-teal-900 hover:bg-teal-50 active:scale-[0.98] gap-2 font-semibold h-12 px-8">{T.ctaBtn1} <ArrowRight className="h-5 w-5" /></Button></Link>
          <Button asChild size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8 gap-2">
            <a href={consultationMailto(lang)}><Mail className="h-4 w-4" />{T.ctaBtn2}</a>
          </Button>
        </div>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
