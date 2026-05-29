import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { CheckCircle2, XCircle, Zap, ArrowRight, MessageSquare, FileText, Users, Shield, BarChart2, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Starter",
    price: "Gratis",
    period: "Selamanya",
    description: "Untuk tim kecil yang baru memulai",
    color: "border-gray-200",
    badge: null,
    features: [
      { label: "5 karyawan", ok: true },
      { label: "10 dokumen", ok: true },
      { label: "100 pertanyaan / bulan", ok: true },
      { label: "Chat AI berbasis RAG", ok: true },
      { label: "Upload PDF & DOCX", ok: true },
      { label: "Analytics dasar", ok: false },
      { label: "Notifikasi email", ok: false },
      { label: "Slack integration", ok: false },
      { label: "Role per departemen", ok: false },
      { label: "Prioritas dukungan", ok: false },
    ],
    cta: "Mulai Gratis",
    ctaHref: "/register",
    ctaVariant: "outline" as const,
  },
  {
    name: "Professional",
    price: "Rp 299.000",
    period: "per bulan",
    description: "Untuk perusahaan berkembang",
    color: "border-blue-500 shadow-blue-100 shadow-xl",
    badge: "Paling Populer",
    features: [
      { label: "50 karyawan", ok: true },
      { label: "100 dokumen", ok: true },
      { label: "Pertanyaan tidak terbatas", ok: true },
      { label: "Chat AI berbasis RAG", ok: true },
      { label: "Upload PDF & DOCX", ok: true },
      { label: "Analytics lengkap", ok: true },
      { label: "Notifikasi email", ok: true },
      { label: "Slack integration", ok: true },
      { label: "Role per departemen", ok: true },
      { label: "Prioritas dukungan", ok: false },
    ],
    cta: "Coba 14 Hari Gratis",
    ctaHref: "/register?plan=pro",
    ctaVariant: "default" as const,
  },
  {
    name: "Enterprise",
    price: "Rp 799.000",
    period: "per bulan",
    description: "Untuk perusahaan skala besar",
    color: "border-violet-400",
    badge: null,
    features: [
      { label: "Karyawan tidak terbatas", ok: true },
      { label: "Dokumen tidak terbatas", ok: true },
      { label: "Pertanyaan tidak terbatas", ok: true },
      { label: "Chat AI berbasis RAG", ok: true },
      { label: "Upload PDF & DOCX", ok: true },
      { label: "Analytics lengkap + ekspor", ok: true },
      { label: "Notifikasi email", ok: true },
      { label: "Slack & Teams integration", ok: true },
      { label: "Role per departemen", ok: true },
      { label: "Prioritas dukungan 24/7", ok: true },
    ],
    cta: "Hubungi Sales",
    ctaHref: "mailto:sales@intellibase.ai",
    ctaVariant: "outline" as const,
  },
];

const FAQS = [
  { q: "Apakah data perusahaan saya aman?", a: "Ya. Setiap perusahaan memiliki ruang data yang terisolasi penuh. Dokumen Anda tidak pernah dicampur atau dibagikan ke tenant lain." },
  { q: "Format dokumen apa yang didukung?", a: "Saat ini kami mendukung PDF dan DOCX. Format lain (Excel, PowerPoint) akan segera hadir." },
  { q: "Bagaimana cara upgrade atau downgrade paket?", a: "Anda dapat mengubah paket kapan saja melalui dashboard admin. Perubahan berlaku di awal siklus billing berikutnya." },
  { q: "Apakah ada kontrak jangka panjang?", a: "Tidak. Semua paket berbasis bulanan dan dapat dibatalkan kapan saja tanpa biaya penalti." },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <LogoFull size="sm" />
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Masuk</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Mulai Gratis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-16 px-6 bg-gradient-to-b from-blue-50 to-white">
        <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          Harga Transparan, Tanpa Biaya Tersembunyi
        </span>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Pilih Paket yang Tepat untuk Tim Anda
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          Mulai gratis, upgrade ketika siap. Semua paket sudah termasuk enkripsi data dan isolasi multi-tenant.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div key={plan.name} className={cn("rounded-2xl border-2 p-8 flex flex-col relative", plan.color)}>
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <Zap className="h-3 w-3" />{plan.badge}
                  </span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <p className="text-gray-500 text-sm mb-4">{plan.description}</p>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-400 text-sm pb-1">/ {plan.period}</span>
                </div>
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex items-center gap-2.5 text-sm">
                    {f.ok
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      : <XCircle className="h-4 w-4 text-gray-200 shrink-0" />}
                    <span className={f.ok ? "text-gray-700" : "text-gray-300"}>{f.label}</span>
                  </li>
                ))}
              </ul>
              <Link href={plan.ctaHref}>
                <Button variant={plan.ctaVariant} className={cn("w-full gap-2",
                  plan.ctaVariant === "default" && "bg-blue-600 hover:bg-blue-700")}>
                  {plan.cta} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-5xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Semua yang Anda Butuhkan</h2>
          <p className="text-gray-500">Platform lengkap untuk manajemen pengetahuan internal perusahaan</p>
        </div>
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { icon: MessageSquare, title: "Chat AI Berbasis RAG", desc: "Jawaban akurat dari dokumen internal, bukan dari internet umum" },
            { icon: FileText, title: "Multi-Format Dokumen", desc: "Upload PDF, DOCX dan ekstrak teks otomatis dengan AI" },
            { icon: Users, title: "Manajemen Tim", desc: "Kelola karyawan, role, dan akses per departemen" },
            { icon: Shield, title: "Keamanan Multi-Tenant", desc: "Data tiap perusahaan terisolasi penuh, tidak ada kebocoran" },
            { icon: BarChart2, title: "Analytics & Insight", desc: "Pantau pertanyaan terpopuler dan aktivitas karyawan" },
            { icon: Link2, title: "Integrasi Slack", desc: "Tanya langsung dari Slack tanpa buka browser" },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-6 border">
              <div className="p-2 bg-blue-50 rounded-lg w-fit mb-3">
                <f.icon className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-gray-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Pertanyaan Umum</h2>
        <div className="space-y-6">
          {FAQS.map((faq) => (
            <div key={faq.q} className="border-b pb-6">
              <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-violet-600 py-16 px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-3">Siap Transformasi Knowledge Base Perusahaan Anda?</h2>
        <p className="text-blue-100 mb-8">Mulai gratis hari ini. Tidak perlu kartu kredit.</p>
        <Link href="/register">
          <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 gap-2 font-semibold">
            Mulai Gratis Sekarang <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <LogoFull size="sm" />
          <p className="text-gray-400 text-sm">© 2026 IntelliBase. All rights reserved.</p>
          <div className="flex gap-4 text-sm text-gray-400">
            <Link href="/login" className="hover:text-gray-600">Login</Link>
            <Link href="/register" className="hover:text-gray-600">Daftar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
