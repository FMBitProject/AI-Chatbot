import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kebijakan Privasi — IntelliBase AI" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <Link href="/"><LogoFull size="sm" /></Link>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">Masuk</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Kebijakan Privasi</h1>
        <p className="text-gray-400 text-sm mb-10">Terakhir diperbarui: 30 Mei 2026</p>
        <div className="space-y-8 text-sm leading-relaxed text-gray-700">
          {[
            { title: "1. Data yang Kami Kumpulkan", body: "Kami mengumpulkan: (a) Informasi akun: nama, email, nama perusahaan; (b) Dokumen yang Anda upload beserta kontennya; (c) Log aktivitas chat dan pertanyaan; (d) Data teknis: alamat IP, browser, timestamp." },
            { title: "2. Cara Kami Menggunakan Data", body: "Data Anda digunakan untuk: menyediakan layanan AI chat, mengindeks dokumen perusahaan Anda, meningkatkan akurasi pencarian, dan memproses pembayaran. Kami tidak menjual data Anda kepada pihak ketiga." },
            { title: "3. Penyimpanan dan Keamanan Data", body: "Data disimpan di Neon PostgreSQL (server berbasis cloud). Semua koneksi dienkripsi dengan TLS. Dokumen Anda diindeks dalam ruang terisolasi per perusahaan menggunakan embedding vektor." },
            { title: "4. Berbagi Data dengan Pihak Ketiga", body: "Kami berbagi data dengan pihak ketiga terbatas berikut: Groq Inc. (pemrosesan teks AI, data tidak disimpan permanen), Google LLC (embedding teks via Gemini API, data tidak disimpan permanen), Midtrans (pemrosesan pembayaran, berlisensi Bank Indonesia), Neon Inc. (penyimpanan database terenkripsi). Kami tidak berbagi data dengan pihak lain tanpa persetujuan eksplisit Anda." },
            { title: "5. Hak Anda (sesuai UU PDP No. 27/2022)", body: "Anda berhak: mengakses data Anda, mengoreksi data yang tidak akurat, menghapus akun dan seluruh data, menarik persetujuan pemrosesan data, mengajukan keberatan atas pemrosesan data. Untuk permintaan tersebut, hubungi: intellibaseaisupport@gmail.com" },
            { title: "6. Cookie", body: "Kami menggunakan cookie session untuk autentikasi (wajib) dan cookie preferensi untuk menyimpan pilihan bahasa (opsional). Anda dapat menolak cookie non-esensial melalui banner consent." },
            { title: "7. Retensi Data", body: "Data akun disimpan selama akun aktif. Setelah penghapusan akun, data dihapus dalam 30 hari. Log sistem disimpan maksimal 90 hari." },
            { title: "8. Perubahan Kebijakan", body: "Perubahan material pada kebijakan ini akan diberitahukan melalui notifikasi dalam aplikasi. Penggunaan berkelanjutan dianggap sebagai penerimaan kebijakan yang diperbarui." },
            { title: "9. Kontak", body: "Pertanyaan tentang privasi dan perlindungan data: intellibaseaisupport@gmail.com" },
          ].map((s) => (
            <div key={s.title}>
              <h2 className="font-semibold text-gray-900 text-base mb-2">{s.title}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t py-6 px-6 text-center text-gray-400 text-xs">
        © 2026 IntelliBase AI · <Link href="/terms" className="hover:text-gray-600">Syarat & Ketentuan</Link>
      </footer>
    </div>
  );
}
