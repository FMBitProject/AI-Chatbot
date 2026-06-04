"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { ArrowRight, Zap, ShieldCheck, Users, FileText, BarChart2, MessageSquare, Star } from "lucide-react";

const CONTENT = {
  id: {
    badge: "🚀 Platform Knowledge Base #1 untuk Tim Internal Indonesia",
    hero1: "Karyawan Anda Bisa Tahu Semua",
    hero2: "Kebijakan Perusahaan",
    hero3: "dalam Detik",
    heroDesc: "IntelliBase AI mengubah dokumen SOP, regulasi HR, panduan IT, kebijakan keuangan, kontrak, manual produk, dan dokumen internal lainnya menjadi asisten AI yang bisa menjawab pertanyaan karyawan secara instan — kapanpun, dimanapun.",
    cta1: "Mulai Gratis Sekarang",
    cta2: "Lihat Paket Harga",
    ctaNote: "Gratis selamanya untuk tim kecil · Tidak perlu kartu kredit",
    stats: [{ v: "90%", l: "Pengurangan waktu pencarian dokumen" }, { v: "< 3 detik", l: "Rata-rata waktu respons AI" }, { v: "100%", l: "Isolasi data antar perusahaan" }, { v: "10 menit", l: "Waktu setup hingga siap pakai" }],
    howTitle: "Cara Kerja IntelliBase",
    howDesc: "Setup dalam 10 menit, langsung bisa digunakan seluruh tim",
    steps: [
      { n: "1", t: "Upload Dokumen", d: "Admin upload SOP, regulasi HR, atau panduan IT dalam format PDF, DOCX, Excel, atau PowerPoint. AI langsung mengindeks.", icon: FileText },
      { n: "2", t: "Undang Karyawan", d: "Tambahkan akun karyawan dari dashboard. Mereka bisa langsung login dan mulai bertanya.", icon: Users },
      { n: "3", t: "Tanya & Dapat Jawaban", d: "Karyawan ketik pertanyaan di chat. AI menjawab berdasarkan dokumen resmi perusahaan.", icon: MessageSquare },
    ],
    featTitle: "Semua yang Dibutuhkan Tim Anda",
    featDesc: "Platform lengkap untuk manajemen pengetahuan internal perusahaan",
    features: [
      { icon: MessageSquare, t: "Chat AI Berbasis RAG", d: "Jawaban akurat dari dokumen internal Anda — bukan dari internet umum." },
      { icon: FileText, t: "Upload PDF, DOCX, Excel & PowerPoint", d: "Upload SOP, regulasi HR, panduan IT. AI langsung mengindeks dan siap menjawab." },
      { icon: ShieldCheck, t: "Isolasi Data Multi-Tenant", d: "Data tiap perusahaan terisolasi penuh. Tidak ada kebocoran ke tenant lain." },
      { icon: Users, t: "Manajemen Tim", d: "Admin kelola karyawan, role, dan akses dokumen per departemen." },
      { icon: BarChart2, t: "Analytics & Audit Log", d: "Pantau pertanyaan terpopuler dan siapa bertanya apa untuk insight bisnis." },
      { icon: Zap, t: "Jawaban Instan", d: "Tidak perlu buka dokumen satu per satu. Tanya langsung, dapat jawaban dalam detik." },
    ],
    testiTitle: "Dipercaya oleh Tim HR & IT di Indonesia",
    testimonials: [
      { name: "Budi Santoso", role: "HR Manager", company: "PT. Maju Bersama", text: "IntelliBase memangkas waktu karyawan mencari SOP dari 30 menit menjadi 30 detik." },
      { name: "Siti Rahayu", role: "IT Director", company: "CV. Teknologi Nusantara", text: "Onboarding karyawan baru jadi jauh lebih mudah. Semua panduan IT bisa diakses lewat chat." },
      { name: "Ahmad Fauzi", role: "Operations Head", company: "PT. Sukses Abadi", text: "Akhirnya ada solusi yang benar-benar bisa dipakai tim tanpa perlu training panjang." },
    ],
    priceTitle: "Harga yang Transparan",
    priceDesc: "Mulai gratis, upgrade ketika tim Anda berkembang. Tidak ada biaya tersembunyi.",
    pricePlans: [
      { name: "Starter", price: "Gratis", desc: "5 karyawan · 10 dokumen" },
      { name: "Professional", price: "Rp 200rb/bln", desc: "50 karyawan · 100 dokumen", promo: true },
      { name: "Enterprise", price: "Rp 500rb/bln", desc: "Tidak terbatas", promo: true },
    ],
    priceBtn: "Lihat Detail Harga",
    ctaTitle: "Mulai Transformasi Knowledge Base Anda Hari Ini",
    ctaDesc: "Gratis untuk tim kecil. Setup 10 menit. Tidak perlu kartu kredit.",
    ctaBtn1: "Mulai Gratis Sekarang",
    ctaBtn2: "Lihat Paket Harga",
    nav: { price: "Harga", login: "Masuk", start: "Mulai Gratis" },
    footer: { price: "Harga", login: "Masuk", register: "Daftar", terms: "Syarat & Ketentuan", privacy: "Privasi" },
  },
  en: {
    badge: "🚀 #1 Internal Knowledge Base Platform in Indonesia",
    hero1: "Your Employees Can Know All",
    hero2: "Company Policies",
    hero3: "in Seconds",
    heroDesc: "IntelliBase AI transforms your SOPs, HR regulations, IT guidelines, finance policies, contracts, product manuals, and any internal documents into an AI assistant that answers employee questions instantly — anytime, anywhere.",
    cta1: "Start Free Now",
    cta2: "View Pricing",
    ctaNote: "Free forever for small teams · No credit card required",
    stats: [{ v: "90%", l: "Reduction in document search time" }, { v: "< 3 sec", l: "Average AI response time" }, { v: "100%", l: "Data isolation between companies" }, { v: "10 min", l: "Setup time until ready" }],
    howTitle: "How IntelliBase Works",
    howDesc: "Setup in 10 minutes, ready for the whole team immediately",
    steps: [
      { n: "1", t: "Upload Documents", d: "Admin uploads SOPs, HR regulations, or IT guidelines in PDF, DOCX, Excel, or PowerPoint format. AI indexes immediately.", icon: FileText },
      { n: "2", t: "Invite Employees", d: "Add employee accounts from the dashboard. They can log in and start asking questions right away.", icon: Users },
      { n: "3", t: "Ask & Get Answers", d: "Employees type questions in chat. AI answers based on official company documents.", icon: MessageSquare },
    ],
    featTitle: "Everything Your Team Needs",
    featDesc: "A complete platform for internal company knowledge management",
    features: [
      { icon: MessageSquare, t: "RAG-based AI Chat", d: "Accurate answers from your internal documents — not from the general internet." },
      { icon: FileText, t: "PDF, DOCX, Excel & PowerPoint Upload", d: "Upload SOPs, HR regulations, IT guidelines. AI indexes instantly and is ready to answer." },
      { icon: ShieldCheck, t: "Multi-Tenant Data Isolation", d: "Each company's data is fully isolated. No leaks to other tenants." },
      { icon: Users, t: "Team Management", d: "Admin manages employees, roles, and document access per department." },
      { icon: BarChart2, t: "Analytics & Audit Log", d: "Monitor top questions and who asked what for business insights." },
      { icon: Zap, t: "Instant Answers", d: "No need to open documents one by one. Ask directly, get answers in seconds." },
    ],
    testiTitle: "Trusted by HR & IT Teams in Indonesia",
    testimonials: [
      { name: "Budi Santoso", role: "HR Manager", company: "PT. Maju Bersama", text: "IntelliBase cut employee SOP search time from 30 minutes to 30 seconds." },
      { name: "Siti Rahayu", role: "IT Director", company: "CV. Teknologi Nusantara", text: "New employee onboarding is much easier. All IT guides can be accessed through chat." },
      { name: "Ahmad Fauzi", role: "Operations Head", company: "PT. Sukses Abadi", text: "Finally a solution the team can actually use without lengthy training." },
    ],
    priceTitle: "Transparent Pricing",
    priceDesc: "Start free, upgrade as your team grows. No hidden fees.",
    pricePlans: [
      { name: "Starter", price: "Free", desc: "5 employees · 10 documents" },
      { name: "Professional", price: "Rp 200k/mo", desc: "50 employees · 100 documents", promo: true },
      { name: "Enterprise", price: "Rp 500k/mo", desc: "Unlimited", promo: true },
    ],
    priceBtn: "View Full Pricing",
    ctaTitle: "Start Transforming Your Knowledge Base Today",
    ctaDesc: "Free for small teams. 10-minute setup. No credit card required.",
    ctaBtn1: "Start Free Now",
    ctaBtn2: "View Pricing",
    nav: { price: "Pricing", login: "Sign In", start: "Start Free" },
    footer: { price: "Pricing", login: "Sign In", register: "Register", terms: "Terms", privacy: "Privacy" },
  },
};

export function LandingContent() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <LogoFull size="sm" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden sm:block">{T.nav.price}</Link>
            <Link href="/login"><Button variant="ghost" size="sm">{T.nav.login}</Button></Link>
            <Link href="/register"><Button size="sm" className="bg-blue-600 hover:bg-blue-700">{T.nav.start}</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-24 px-6 bg-gradient-to-b from-blue-50 via-white to-white">
        <div className="max-w-4xl mx-auto">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-6">{T.badge}</span>
          <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
            {T.hero1}<br />
            <span className="text-blue-600">{T.hero2}</span> {T.hero3}
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">{T.heroDesc}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register"><Button size="lg" className="bg-blue-600 hover:bg-blue-700 gap-2 h-12 px-8">{T.cta1} <ArrowRight className="h-5 w-5" /></Button></Link>
            <Link href="/pricing"><Button size="lg" className="bg-gray-900 hover:bg-gray-700 text-white gap-2 h-12 px-8 shadow-sm">{T.cta2} <ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
          <p className="text-xs text-gray-400 mt-4">{T.ctaNote}</p>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-blue-600 py-12 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {T.stats.map((s) => (
            <div key={s.l} className="text-center">
              <p className="text-3xl font-bold text-white mb-1">{s.v}</p>
              <p className="text-blue-100 text-sm">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{T.howTitle}</h2>
            <p className="text-gray-500">{T.howDesc}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {T.steps.map((s) => (
              <div key={s.n} className="bg-white rounded-2xl p-8 border text-center relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">{s.n}</div>
                <div className="p-3 bg-blue-50 rounded-xl w-fit mx-auto mb-4 mt-2"><s.icon className="h-6 w-6 text-blue-600" /></div>
                <h3 className="font-bold text-gray-900 mb-2">{s.t}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">{T.featTitle}</h2>
            <p className="text-gray-500">{T.featDesc}</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {T.features.map((f) => (
              <div key={f.t} className="rounded-xl border p-6 hover:border-blue-200 hover:shadow-sm transition-all">
                <div className="p-2 bg-blue-50 rounded-lg w-fit mb-3"><f.icon className="h-5 w-5 text-blue-600" /></div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.t}</h3>
                <p className="text-gray-500 text-sm">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Pricing teaser */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">{T.priceTitle}</h2>
          <p className="text-gray-500 mb-8">{T.priceDesc}</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {T.pricePlans.map((p) => (
              <div key={p.name} className={`rounded-xl border p-5 text-left ${p.promo ? "border-blue-200 bg-blue-50" : ""}`}>
                {p.promo && <span className="text-xs font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full mb-2 inline-block">PROMO</span>}
                <p className="font-bold text-gray-900">{p.name}</p>
                <p className="text-blue-600 font-semibold text-sm">{p.price}</p>
                <p className="text-gray-400 text-xs mt-1">{p.desc}</p>
              </div>
            ))}
          </div>
          <Link href="/pricing"><Button variant="outline" className="gap-2">{T.priceBtn} <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-violet-600 py-20 px-6 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">{T.ctaTitle}</h2>
        <p className="text-blue-100 text-lg mb-8">{T.ctaDesc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register"><Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 gap-2 font-semibold h-12 px-8">{T.ctaBtn1} <ArrowRight className="h-5 w-5" /></Button></Link>
          <Link href="/pricing"><Button size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8">{T.ctaBtn2}</Button></Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 pr-24">
          <LogoFull size="sm" />
          <p className="text-gray-400 text-sm">© 2026 IntelliBase AI. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/pricing" className="hover:text-gray-600">{T.footer.price}</Link>
            <Link href="/login" className="hover:text-gray-600">{T.footer.login}</Link>
            <Link href="/register" className="hover:text-gray-600">{T.footer.register}</Link>
            <Link href="/terms" className="hover:text-gray-600">{T.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-gray-600">{T.footer.privacy}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
