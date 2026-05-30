import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { ArrowRight, BookOpen, Zap, ShieldCheck, Users, FileText, BarChart2, MessageSquare, CheckCircle2, Star } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntelliBase AI — Knowledge Base Internal Perusahaan Berbasis AI",
  description: "Platform RAG untuk akses SOP, regulasi, dan panduan perusahaan secara instan melalui AI chat. Multi-tenant, aman, dan mudah digunakan.",
};

const FEATURES = [
  { icon: MessageSquare, title: "Chat AI Berbasis RAG", desc: "Jawaban akurat dari dokumen internal Anda — bukan dari internet umum." },
  { icon: FileText, title: "Upload PDF & DOCX", desc: "Upload SOP, regulasi HR, panduan IT. AI langsung mengindeks dan siap menjawab." },
  { icon: ShieldCheck, title: "Isolasi Data Multi-Tenant", desc: "Data tiap perusahaan terisolasi penuh. Tidak ada kebocoran ke tenant lain." },
  { icon: Users, title: "Manajemen Tim", desc: "Admin kelola karyawan, role, dan akses dokumen per departemen." },
  { icon: BarChart2, title: "Analytics & Audit Log", desc: "Pantau pertanyaan terpopuler dan siapa bertanya apa untuk insight bisnis." },
  { icon: Zap, title: "Jawaban Instan", desc: "Tidak perlu buka dokumen satu per satu. Tanya langsung, dapat jawaban dalam detik." },
];

const TESTIMONIALS = [
  { name: "Budi Santoso", role: "HR Manager", company: "PT. Maju Bersama", text: "IntelliBase memangkas waktu karyawan mencari SOP dari 30 menit menjadi 30 detik." },
  { name: "Siti Rahayu", role: "IT Director", company: "CV. Teknologi Nusantara", text: "Onboarding karyawan baru jadi jauh lebih mudah. Semua panduan IT bisa diakses lewat chat." },
  { name: "Ahmad Fauzi", role: "Operations Head", company: "PT. Sukses Abadi", text: "Akhirnya ada solusi yang benar-benar bisa dipakai tim tanpa perlu training panjang." },
];

const STATS = [
  { value: "90%", label: "Pengurangan waktu pencarian dokumen" },
  { value: "< 3 detik", label: "Rata-rata waktu respons AI" },
  { value: "100%", label: "Isolasi data antar perusahaan" },
  { value: "10 menit", label: "Waktu setup hingga siap pakai" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <LogoFull size="sm" />
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden sm:block">Harga</Link>
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
      <section className="text-center py-24 px-6 bg-gradient-to-b from-blue-50 via-white to-white">
        <div className="max-w-4xl mx-auto">
          <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-6">
            🚀 Platform Knowledge Base #1 untuk Tim Internal Indonesia
          </span>
          <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
            Karyawan Anda Bisa Tahu Semua<br />
            <span className="text-blue-600">Kebijakan Perusahaan</span> dalam Detik
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            IntelliBase AI mengubah dokumen SOP, regulasi HR, dan panduan IT Anda menjadi asisten AI yang bisa menjawab pertanyaan karyawan secara instan — kapanpun, dimanapun.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 gap-2 h-12 px-8">
                Mulai Gratis Sekarang <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="h-12 px-8">
                Lihat Paket Harga
              </Button>
            </Link>
          </div>
          <p className="text-xs text-gray-400 mt-4">Gratis selamanya untuk tim kecil · Tidak perlu kartu kredit</p>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-blue-600 py-12 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-bold text-white mb-1">{s.value}</p>
              <p className="text-blue-100 text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Cara Kerja IntelliBase</h2>
            <p className="text-gray-500">Setup dalam 10 menit, langsung bisa digunakan seluruh tim</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Upload Dokumen", desc: "Admin upload SOP, regulasi HR, atau panduan IT dalam format PDF/DOCX. AI langsung mengindeks.", icon: FileText },
              { step: "2", title: "Undang Karyawan", desc: "Tambahkan akun karyawan dari dashboard. Mereka bisa langsung login dan mulai bertanya.", icon: Users },
              { step: "3", title: "Tanya & Dapat Jawaban", desc: "Karyawan ketik pertanyaan di chat. AI menjawab berdasarkan dokumen resmi perusahaan.", icon: MessageSquare },
            ].map((s) => (
              <div key={s.step} className="bg-white rounded-2xl p-8 border text-center relative">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                  {s.step}
                </div>
                <div className="p-3 bg-blue-50 rounded-xl w-fit mx-auto mb-4 mt-2">
                  <s.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Semua yang Dibutuhkan Tim Anda</h2>
            <p className="text-gray-500">Platform lengkap untuk manajemen pengetahuan internal perusahaan</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border p-6 hover:border-blue-200 hover:shadow-sm transition-all">
                <div className="p-2 bg-blue-50 rounded-lg w-fit mb-3">
                  <f.icon className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Dipercaya oleh Tim HR & IT di Indonesia</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border p-6">
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-gray-400 text-xs">{t.role} · {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Harga yang Transparan</h2>
          <p className="text-gray-500 mb-8">Mulai gratis, upgrade ketika tim Anda berkembang. Tidak ada biaya tersembunyi.</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[
              { name: "Starter", price: "Gratis", desc: "5 karyawan · 10 dokumen" },
              { name: "Professional", price: "Rp 200rb/bln", desc: "50 karyawan · 100 dokumen", promo: true },
              { name: "Enterprise", price: "Rp 500rb/bln", desc: "Tidak terbatas", promo: true },
            ].map((p) => (
              <div key={p.name} className={`rounded-xl border p-5 text-left ${p.promo ? "border-blue-200 bg-blue-50" : ""}`}>
                {p.promo && <span className="text-xs font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full mb-2 inline-block">PROMO</span>}
                <p className="font-bold text-gray-900">{p.name}</p>
                <p className="text-blue-600 font-semibold text-sm">{p.price}</p>
                <p className="text-gray-400 text-xs mt-1">{p.desc}</p>
              </div>
            ))}
          </div>
          <Link href="/pricing">
            <Button variant="outline" className="gap-2">Lihat Detail Harga <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-violet-600 py-20 px-6 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Mulai Transformasi Knowledge Base Anda Hari Ini</h2>
        <p className="text-blue-100 text-lg mb-8">Gratis untuk tim kecil. Setup 10 menit. Tidak perlu kartu kredit.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 gap-2 font-semibold h-12 px-8">
              Mulai Gratis Sekarang <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 h-12 px-8">
              Lihat Paket Harga
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <LogoFull size="sm" />
          <p className="text-gray-400 text-sm">© 2026 IntelliBase AI. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/pricing" className="hover:text-gray-600">Harga</Link>
            <Link href="/login" className="hover:text-gray-600">Masuk</Link>
            <Link href="/register" className="hover:text-gray-600">Daftar</Link>
            <Link href="/terms" className="hover:text-gray-600">Syarat & Ketentuan</Link>
            <Link href="/privacy" className="hover:text-gray-600">Privasi</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
