import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Syarat & Ketentuan — IntelliBase AI" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <Link href="/"><LogoFull size="sm" /></Link>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">Masuk</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Syarat & Ketentuan</h1>
        <p className="text-gray-400 text-sm mb-10">Terakhir diperbarui: 30 Mei 2026</p>
        <div className="prose prose-gray max-w-none space-y-8 text-sm leading-relaxed text-gray-700">
          {[
            { title: "1. Penerimaan Syarat", body: "Dengan mendaftar dan menggunakan layanan IntelliBase AI, Anda menyetujui untuk terikat oleh Syarat dan Ketentuan ini. Jika Anda tidak menyetujui syarat ini, harap tidak menggunakan layanan kami." },
            { title: "2. Deskripsi Layanan", body: "IntelliBase AI adalah platform SaaS (Software as a Service) yang menyediakan layanan knowledge base internal berbasis AI untuk perusahaan. Layanan mencakup upload dokumen, pencarian berbasis vektor, dan antarmuka chat AI." },
            { title: "3. Akun dan Keamanan", body: "Anda bertanggung jawab atas kerahasiaan kredensial akun Anda. Setiap aktivitas yang terjadi di bawah akun Anda adalah tanggung jawab Anda. Segera hubungi kami jika Anda mencurigai akses tidak sah." },
            { title: "4. Kepemilikan Data", body: "Dokumen dan data yang Anda upload tetap menjadi milik Anda sepenuhnya. Kami tidak menggunakan data perusahaan Anda untuk melatih model AI atau tujuan lain di luar layanan yang disepakati." },
            { title: "5. Isolasi Data Multi-Tenant", body: "Data setiap perusahaan disimpan dan diproses secara terisolasi. Kami menerapkan kontrol teknis dan organisasional untuk memastikan tidak ada kebocoran data antar tenant." },
            { title: "6. Pembayaran dan Langganan", body: "Paket berbayar ditagih bulanan. Pembayaran diproses melalui Midtrans. Langganan dapat dibatalkan kapan saja; pembatalan berlaku di akhir periode billing yang berjalan." },
            { title: "7. Batasan Layanan", body: "Layanan Free tier dibatasi sesuai ketentuan paket yang berlaku. Penggunaan melebihi batas memerlukan upgrade ke paket berbayar." },
            { title: "8. Penghentian Layanan", body: "Kami berhak menghentikan akses akun yang melanggar syarat penggunaan, termasuk penggunaan untuk tujuan ilegal atau berbahaya." },
            { title: "9. Perubahan Syarat", body: "Kami dapat memperbarui syarat ini sewaktu-waktu. Perubahan material akan diberitahukan melalui email atau notifikasi dalam aplikasi minimal 14 hari sebelum berlaku." },
            { title: "10. Kontak", body: "Untuk pertanyaan terkait syarat ini, hubungi kami di: legal@intellibase.ai" },
          ].map((s) => (
            <div key={s.title}>
              <h2 className="font-semibold text-gray-900 text-base mb-2">{s.title}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t py-6 px-6 text-center text-gray-400 text-xs">
        © 2026 IntelliBase AI · <Link href="/privacy" className="hover:text-gray-600">Kebijakan Privasi</Link>
      </footer>
    </div>
  );
}
