"use client";
import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";

const CONTENT = {
  id: {
    title: "Kebijakan Privasi",
    updated: "Terakhir diperbarui: 3 Juni 2026",
    login: "Masuk",
    sections: [
      { title: "1. Data yang Kami Kumpulkan", body: "Kami mengumpulkan: (a) Informasi akun: nama, email, nama perusahaan; (b) Dokumen yang Anda upload beserta kontennya; (c) Log aktivitas chat dan pertanyaan; (d) Data teknis: alamat IP, browser, timestamp." },
      { title: "2. Cara Kami Menggunakan Data", body: "Data Anda digunakan untuk: menyediakan layanan AI chat, mengindeks dokumen perusahaan Anda, meningkatkan akurasi pencarian, dan memproses pembayaran. Kami tidak menjual data Anda kepada pihak ketiga." },
      { title: "3. Penyimpanan dan Keamanan Data", body: "Data disimpan di Neon PostgreSQL (server berbasis cloud). Semua koneksi dienkripsi dengan TLS. Dokumen Anda diindeks dalam ruang terisolasi per perusahaan menggunakan embedding vektor." },
      { title: "4. Berbagi Data dengan Pihak Ketiga", body: "Kami berbagi data dengan pihak ketiga terbatas berikut: Groq Inc. (pemrosesan teks AI, data tidak disimpan permanen), Google LLC (embedding teks via Gemini API, data tidak disimpan permanen), Midtrans (pemrosesan pembayaran, berlisensi Bank Indonesia), Neon Inc. (penyimpanan database terenkripsi). Kami tidak berbagi data dengan pihak lain tanpa persetujuan eksplisit Anda." },
      { title: "5. Hak Anda (sesuai UU PDP No. 27/2022)", body: "Anda berhak: mengakses data Anda, mengoreksi data yang tidak akurat, menghapus akun dan seluruh data, menarik persetujuan pemrosesan data, mengajukan keberatan atas pemrosesan data. Untuk permintaan tersebut, hubungi: intellibaseaisupport@gmail.com" },
      { title: "6. Cookie", body: "Kami menggunakan cookie session untuk autentikasi (wajib) dan cookie preferensi untuk menyimpan pilihan bahasa (opsional). Anda dapat menolak cookie non-esensial melalui banner consent." },
      { title: "7. Retensi Data", body: "Data akun disimpan selama akun aktif. Setelah penghapusan akun, data dihapus dalam 30 hari. Log sistem disimpan maksimal 90 hari." },
      { title: "8. Perubahan Kebijakan", body: "Perubahan material pada kebijakan ini akan diberitahukan melalui notifikasi dalam aplikasi. Penggunaan berkelanjutan dianggap sebagai penerimaan kebijakan yang diperbarui." },
      { title: "9. Kontak", body: "Pertanyaan tentang privasi dan perlindungan data: intellibaseaisupport@gmail.com" },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: June 3, 2026",
    login: "Sign In",
    sections: [
      { title: "1. Data We Collect", body: "We collect: (a) Account information: name, email, company name; (b) Documents you upload and their contents; (c) Chat activity and question logs; (d) Technical data: IP address, browser, timestamps." },
      { title: "2. How We Use Your Data", body: "Your data is used to: provide the AI chat service, index your company documents, improve search accuracy, and process payments. We do not sell your data to third parties." },
      { title: "3. Data Storage and Security", body: "Data is stored in Neon PostgreSQL (cloud-based servers). All connections are encrypted with TLS. Your documents are indexed in a per-company isolated space using vector embeddings." },
      { title: "4. Sharing Data with Third Parties", body: "We share data with the following limited third parties: Groq Inc. (AI text processing, data not stored permanently), Google LLC (text embeddings via Gemini API, data not stored permanently), Midtrans (payment processing, licensed by Bank Indonesia), Neon Inc. (encrypted database storage). We do not share your data with any other parties without your explicit consent." },
      { title: "5. Your Rights (pursuant to Indonesian Personal Data Protection Law No. 27/2022)", body: "You have the right to: access your data, correct inaccurate data, delete your account and all associated data, withdraw consent for data processing, and object to data processing. To exercise these rights, contact: intellibaseaisupport@gmail.com" },
      { title: "6. Cookies", body: "We use session cookies for authentication (required) and preference cookies to save your language selection (optional). You may decline non-essential cookies via the consent banner." },
      { title: "7. Data Retention", body: "Account data is stored for as long as the account is active. After account deletion, data is removed within 30 days. System logs are retained for a maximum of 90 days." },
      { title: "8. Policy Changes", body: "Material changes to this policy will be communicated via in-app notifications. Continued use of the service constitutes acceptance of the updated policy." },
      { title: "9. Contact", body: "Questions about privacy and data protection: intellibaseaisupport@gmail.com" },
    ],
  },
};

export default function PrivacyPage() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <Link href="/"><LogoFull size="sm" /></Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="text-sm text-blue-600 hover:underline">{T.login}</Link>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{T.title}</h1>
        <p className="text-gray-400 text-sm mb-10">{T.updated}</p>
        <div className="space-y-8 text-sm leading-relaxed text-gray-700">
          {T.sections.map((s) => (
            <div key={s.title}>
              <h2 className="font-semibold text-gray-900 text-base mb-2">{s.title}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
