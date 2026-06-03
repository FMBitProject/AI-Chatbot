"use client";
import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";

const CONTENT = {
  id: {
    title: "Syarat & Ketentuan",
    updated: "Terakhir diperbarui: 3 Juni 2026",
    login: "Masuk",
    sections: [
      { title: "1. Penerimaan Syarat", body: "Dengan mendaftar dan menggunakan layanan IntelliBase AI, Anda menyetujui untuk terikat oleh Syarat dan Ketentuan ini. Jika Anda tidak menyetujui syarat ini, harap tidak menggunakan layanan kami." },
      { title: "2. Deskripsi Layanan", body: "IntelliBase AI adalah platform SaaS (Software as a Service) yang menyediakan layanan knowledge base internal berbasis AI untuk perusahaan. Layanan mencakup upload dokumen, pencarian berbasis vektor, dan antarmuka chat AI." },
      { title: "3. Akun dan Keamanan", body: "Anda bertanggung jawab atas kerahasiaan kredensial akun Anda. Setiap aktivitas yang terjadi di bawah akun Anda adalah tanggung jawab Anda. Segera hubungi kami jika Anda mencurigai akses tidak sah." },
      { title: "4. Kepemilikan Data", body: "Dokumen dan data yang Anda upload tetap menjadi milik Anda sepenuhnya. Kami tidak menggunakan data perusahaan Anda untuk melatih model AI atau tujuan lain di luar layanan yang disepakati." },
      { title: "5. Isolasi Data Multi-Tenant", body: "Data setiap perusahaan disimpan dan diproses secara terisolasi. Kami menerapkan kontrol teknis dan organisasional untuk memastikan tidak ada kebocoran data antar tenant." },
      { title: "6. Pembayaran dan Langganan", body: "Paket berbayar ditagih bulanan. Pembayaran diproses melalui Midtrans (gateway pembayaran berlisensi di Indonesia). Langganan dapat dibatalkan kapan saja; pembatalan berlaku di akhir periode billing yang berjalan tanpa biaya penalti." },
      { title: "7. Kebijakan Pengembalian Dana", body: "Karena sifat layanan digital, pembayaran yang telah berhasil diproses tidak dapat dikembalikan (non-refundable). Pengecualian: apabila terjadi gangguan teknis dari pihak kami yang menyebabkan layanan tidak dapat digunakan lebih dari 72 jam berturut-turut, kami memberikan kompensasi perpanjangan masa langganan setara durasi gangguan. Untuk klaim, hubungi intellibaseaisupport@gmail.com dalam 7 hari sejak gangguan terjadi." },
      { title: "8. Batasan Layanan dan AI", body: "Layanan dibatasi sesuai paket yang berlaku. Batas penggunaan harian dan bulanan tercantum di halaman harga. Respons AI dihasilkan secara otomatis berdasarkan dokumen yang diupload; kami tidak menjamin keakuratan 100% dan pengguna wajib memverifikasi informasi penting dengan sumber resmi." },
      { title: "9. Penghentian Layanan", body: "Kami berhak menghentikan akses akun yang melanggar syarat penggunaan, termasuk penggunaan untuk tujuan ilegal, penyebaran konten berbahaya, atau upaya merusak sistem." },
      { title: "10. Hukum yang Berlaku", body: "Syarat dan Ketentuan ini diatur oleh hukum Republik Indonesia. Setiap sengketa diselesaikan melalui musyawarah mufakat atau jalur hukum di Indonesia." },
      { title: "11. Perubahan Syarat", body: "Kami dapat memperbarui syarat ini sewaktu-waktu. Perubahan material akan diberitahukan melalui email atau notifikasi dalam aplikasi minimal 14 hari sebelum berlaku." },
      { title: "12. Kontak", body: "Untuk pertanyaan terkait syarat ini, hubungi kami di: intellibaseaisupport@gmail.com" },
    ],
  },
  en: {
    title: "Terms & Conditions",
    updated: "Last updated: June 3, 2026",
    login: "Sign In",
    sections: [
      { title: "1. Acceptance of Terms", body: "By registering and using IntelliBase AI, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use our service." },
      { title: "2. Service Description", body: "IntelliBase AI is a SaaS platform providing AI-powered internal knowledge base services for companies. Services include document upload, vector search, and an AI chat interface." },
      { title: "3. Account and Security", body: "You are responsible for the confidentiality of your account credentials. All activities under your account are your responsibility. Contact us immediately if you suspect unauthorized access." },
      { title: "4. Data Ownership", body: "Documents and data you upload remain entirely yours. We do not use your company data to train AI models or for any purpose beyond the agreed services." },
      { title: "5. Multi-Tenant Data Isolation", body: "Each company's data is stored and processed in isolation. We apply technical and organizational controls to ensure no data leaks between tenants." },
      { title: "6. Payment and Subscription", body: "Paid plans are billed monthly. Payments are processed via Midtrans (a payment gateway licensed in Indonesia). Subscriptions can be cancelled at any time; cancellation takes effect at the end of the current billing period with no penalty." },
      { title: "7. Refund Policy", body: "Due to the digital nature of the service, successfully processed payments are non-refundable. Exception: if a technical failure on our part renders the service unusable for more than 72 consecutive hours, we will provide a subscription extension equal to the outage duration. To file a claim, contact intellibaseaisupport@gmail.com within 7 days of the incident." },
      { title: "8. Service Limits and AI", body: "Service is limited according to the applicable plan. Daily and monthly usage limits are listed on the pricing page. AI responses are auto-generated based on uploaded documents; we do not guarantee 100% accuracy and users must verify important information with official sources." },
      { title: "9. Service Termination", body: "We reserve the right to terminate access to accounts that violate these terms, including use for illegal purposes, spreading harmful content, or attempting to damage the system." },
      { title: "10. Governing Law", body: "These Terms are governed by the laws of the Republic of Indonesia. Any disputes shall be resolved through deliberation or legal channels in Indonesia." },
      { title: "11. Changes to Terms", body: "We may update these terms at any time. Material changes will be communicated via email or in-app notification at least 14 days before taking effect." },
      { title: "12. Contact", body: "For questions about these terms, contact us at: intellibaseaisupport@gmail.com" },
    ],
  },
};

export default function TermsPage() {
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
