"use client";
import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";

const CONTENT = {
  id: {
    title: "Syarat & Ketentuan",
    updated: "Terakhir diperbarui: 3 Agustus 2026",
    login: "Masuk",
    sections: [
      { title: "1. Penerimaan Syarat", body: "Dengan mendaftar dan menggunakan layanan IntelliBase AI, Anda menyetujui untuk terikat oleh Syarat dan Ketentuan ini. Jika Anda tidak menyetujui syarat ini, harap tidak menggunakan layanan kami." },
      { title: "2. Deskripsi Layanan", body: "IntelliBase AI adalah platform SaaS (Software as a Service) yang menyediakan layanan knowledge base internal berbasis AI untuk perusahaan. Layanan mencakup upload dokumen, pencarian berbasis vektor, dan antarmuka chat AI." },
      { title: "3. Akun dan Keamanan", body: "Anda bertanggung jawab atas kerahasiaan kredensial akun Anda. Setiap aktivitas yang terjadi di bawah akun Anda adalah tanggung jawab Anda. Segera hubungi kami jika Anda mencurigai akses tidak sah." },
      { title: "4. Kepemilikan Data dan Pemrosesan oleh Penyedia AI", body: "Dokumen dan data yang Anda upload tetap menjadi milik Anda sepenuhnya. IntelliBase AI tidak melatih model AI dengan data perusahaan Anda, tidak menjualnya, dan tidak menggunakannya untuk tujuan lain di luar layanan yang disepakati. Namun layanan ini berjalan di atas penyedia AI pihak ketiga, dan Anda perlu mengetahui hal berikut sebelum mengunggah: seluruh isi dokumen yang Anda upload dikirim ke Google (Gemini API) untuk dibuatkan indeks pencarian, dan potongan teks yang relevan dikirim ke Groq Inc. saat pertanyaan dijawab. Pemrosesan di sisi penyedia tersebut tunduk pada ketentuan masing-masing penyedia dan berada di luar kendali kami. Groq menyatakan tidak memakai data API pelanggan untuk melatih modelnya. Akun Gemini kami saat ini berada pada tier gratis, dan ketentuan Google untuk tier tersebut mengizinkan Google memakai konten yang dikirim untuk meningkatkan layanannya, termasuk pelatihan model. Rincian lengkap ada di Kebijakan Privasi bagian 4. Jika kebijakan dokumen perusahaan Anda tidak mengizinkan pemrosesan tersebut, hubungi kami sebelum mengunggah: pemrosesan dapat dipindahkan ke tier berbayar yang tidak memakai konten pelanggan, atau Anda dapat menghubungkan API key Groq dan Gemini milik perusahaan Anda sendiri sehingga indexing dokumen dan seluruh pertanyaan diproses melalui akun penyedia milik Anda. Dengan mengunggah dokumen, Anda menyatakan telah memahami ketentuan ini dan berwenang mengunggah dokumen tersebut." },
      { title: "5. Isolasi Data Multi-Tenant", body: "Data setiap perusahaan disimpan dan diproses secara terisolasi. Kami menerapkan kontrol teknis dan organisasional untuk memastikan tidak ada kebocoran data antar tenant." },
      { title: "6. Pembayaran dan Langganan", body: "Paket berbayar ditagih bulanan. Pembayaran diproses melalui Midtrans (gateway pembayaran berlisensi di Indonesia). Langganan dapat dibatalkan kapan saja; pembatalan berlaku di akhir periode billing yang berjalan tanpa biaya penalti." },
      { title: "7. Kebijakan Pengembalian Dana", body: "Karena sifat layanan digital, pembayaran yang telah berhasil diproses tidak dapat dikembalikan (non-refundable). Pengecualian: apabila terjadi gangguan teknis dari pihak kami yang menyebabkan layanan tidak dapat digunakan lebih dari 72 jam berturut-turut, kami memberikan kompensasi perpanjangan masa langganan setara durasi gangguan. Untuk klaim, hubungi hello@intellibaseai.com dalam 7 hari sejak gangguan terjadi." },
      { title: "8. Batasan Layanan dan AI", body: "Layanan dibatasi sesuai paket yang berlaku. Batas penggunaan harian dan bulanan tercantum di halaman harga. Respons AI dihasilkan secara otomatis berdasarkan dokumen yang diupload; kami tidak menjamin keakuratan 100% dan pengguna wajib memverifikasi informasi penting dengan sumber resmi." },
      { title: "9. Penghentian Layanan", body: "Kami berhak menghentikan akses akun yang melanggar syarat penggunaan, termasuk penggunaan untuk tujuan ilegal, penyebaran konten berbahaya, atau upaya merusak sistem." },
      { title: "10. Hukum yang Berlaku", body: "Syarat dan Ketentuan ini diatur oleh hukum Republik Indonesia. Setiap sengketa diselesaikan melalui musyawarah mufakat atau jalur hukum di Indonesia." },
      { title: "11. Perubahan Syarat", body: "Kami dapat memperbarui syarat ini sewaktu-waktu. Perubahan material akan diberitahukan melalui email atau notifikasi dalam aplikasi minimal 14 hari sebelum berlaku." },
      { title: "12. Disclaimer Layanan 'Sebagaimana Adanya'", body: "Layanan IntelliBase AI disediakan 'sebagaimana adanya' (as-is) dan 'sebagaimana tersedia' (as-available) tanpa jaminan dalam bentuk apapun, baik tersurat maupun tersirat, termasuk namun tidak terbatas pada jaminan kelayakan untuk tujuan tertentu, ketersediaan tanpa gangguan, atau bebas dari kesalahan. Kami tidak menjamin bahwa layanan akan selalu tersedia, aman, atau bebas dari bug." },
      { title: "13. Batasan Tanggung Jawab", body: "Sejauh diizinkan oleh hukum yang berlaku, total kewajiban IntelliBase AI kepada Anda atas segala klaim yang timbul dari atau terkait dengan penggunaan layanan ini tidak akan melebihi jumlah total yang telah Anda bayarkan kepada kami dalam periode 3 (tiga) bulan kalender sebelum tanggal klaim diajukan. Batasan ini berlaku terlepas dari bentuk tuntutan, apakah berdasarkan kontrak, perbuatan melawan hukum, atau dasar hukum lainnya." },
      { title: "14. Pengecualian Kerugian Tidak Langsung", body: "Kami tidak bertanggung jawab atas kerugian tidak langsung, insidental, khusus, konsekuensial, atau kerugian yang bersifat hukuman, termasuk namun tidak terbatas pada: kehilangan keuntungan bisnis, kehilangan data, gangguan operasional bisnis, atau kerusakan reputasi, yang timbul dari penggunaan atau ketidakmampuan menggunakan layanan ini, meskipun kami telah diberitahu tentang kemungkinan kerugian tersebut. Pengguna bertanggung jawab penuh atas keputusan bisnis yang diambil berdasarkan output layanan." },
      { title: "15. Disclaimer Khusus AI", body: "Output yang dihasilkan oleh sistem AI IntelliBase bersifat otomatis berdasarkan dokumen yang Anda upload dan tidak merupakan nasihat profesional dalam bidang hukum, keuangan, medis, atau bidang lainnya yang memerlukan lisensi profesional. Kami tidak bertanggung jawab atas konsekuensi apapun yang timbul dari penggunaan atau ketergantungan pada output AI. Pengguna wajib melakukan verifikasi mandiri dan berkonsultasi dengan profesional yang berwenang sebelum mengambil keputusan penting." },
      { title: "16. Force Majeure", body: "Kami tidak bertanggung jawab atas keterlambatan atau kegagalan pelaksanaan kewajiban yang disebabkan oleh keadaan di luar kendali wajar kami, termasuk namun tidak terbatas pada: bencana alam, pemadaman listrik, gangguan infrastruktur internet, serangan siber terhadap penyedia layanan pihak ketiga, regulasi pemerintah, pandemi, atau kejadian lain yang secara umum diklasifikasikan sebagai force majeure." },
      { title: "17. Ganti Rugi dari Pengguna (Indemnifikasi)", body: "Anda setuju untuk menanggung, membela, dan membebaskan IntelliBase AI beserta pejabat, direktur, karyawan, dan agennya dari dan terhadap segala klaim, kerugian, kewajiban, biaya, dan pengeluaran (termasuk biaya hukum yang wajar) yang timbul dari: (a) pelanggaran Anda terhadap Syarat dan Ketentuan ini; (b) penggunaan layanan oleh Anda yang melanggar hukum atau hak pihak ketiga; (c) konten atau dokumen yang Anda upload ke platform." },
      { title: "18. Kontak", body: "Untuk pertanyaan terkait syarat ini, hubungi kami di: hello@intellibaseai.com" },
    ],
  },
  en: {
    title: "Terms & Conditions",
    updated: "Last updated: August 3, 2026",
    login: "Sign In",
    sections: [
      { title: "1. Acceptance of Terms", body: "By registering and using IntelliBase AI, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use our service." },
      { title: "2. Service Description", body: "IntelliBase AI is a SaaS platform providing AI-powered internal knowledge base services for companies. Services include document upload, vector search, and an AI chat interface." },
      { title: "3. Account and Security", body: "You are responsible for the confidentiality of your account credentials. All activities under your account are your responsibility. Contact us immediately if you suspect unauthorized access." },
      { title: "4. Data Ownership and Processing by AI Providers", body: "Documents and data you upload remain entirely yours. IntelliBase AI does not train AI models on your company data, does not sell it, and does not use it for any purpose beyond the agreed services. However, this service runs on top of third-party AI providers, and you should be aware of the following before uploading: the full contents of documents you upload are sent to Google (Gemini API) to build a search index, and the relevant excerpts are sent to Groq Inc. when a question is answered. Processing on those providers' side is governed by their respective terms and is outside our control. Groq states that it does not use customer API data to train its models. Our Gemini account is currently on the free tier, and Google's terms for that tier allow Google to use submitted content to improve their services, including model training. Full detail is in section 4 of our Privacy Policy. If your company's document policy does not permit such processing, contact us before uploading: processing can be moved to a paid tier that does not use customer content, or you may connect your company's own Groq and Gemini API keys so that document indexing and all questions are processed through your own provider accounts. By uploading documents you confirm that you understand these terms and are authorised to upload them." },
      { title: "5. Multi-Tenant Data Isolation", body: "Each company's data is stored and processed in isolation. We apply technical and organizational controls to ensure no data leaks between tenants." },
      { title: "6. Payment and Subscription", body: "Paid plans are billed monthly. Payments are processed via Midtrans (a payment gateway licensed in Indonesia). Subscriptions can be cancelled at any time; cancellation takes effect at the end of the current billing period with no penalty." },
      { title: "7. Refund Policy", body: "Due to the digital nature of the service, successfully processed payments are non-refundable. Exception: if a technical failure on our part renders the service unusable for more than 72 consecutive hours, we will provide a subscription extension equal to the outage duration. To file a claim, contact hello@intellibaseai.com within 7 days of the incident." },
      { title: "8. Service Limits and AI", body: "Service is limited according to the applicable plan. Daily and monthly usage limits are listed on the pricing page. AI responses are auto-generated based on uploaded documents; we do not guarantee 100% accuracy and users must verify important information with official sources." },
      { title: "9. Service Termination", body: "We reserve the right to terminate access to accounts that violate these terms, including use for illegal purposes, spreading harmful content, or attempting to damage the system." },
      { title: "10. Governing Law", body: "These Terms are governed by the laws of the Republic of Indonesia. Any disputes shall be resolved through deliberation or legal channels in Indonesia." },
      { title: "11. Changes to Terms", body: "We may update these terms at any time. Material changes will be communicated via email or in-app notification at least 14 days before taking effect." },
      { title: "12. 'As-Is' Service Disclaimer", body: "The IntelliBase AI service is provided 'as-is' and 'as-available' without warranties of any kind, whether express or implied, including but not limited to implied warranties of fitness for a particular purpose, uninterrupted availability, or freedom from errors. We do not guarantee that the service will always be available, secure, or free of bugs." },
      { title: "13. Limitation of Liability", body: "To the fullest extent permitted by applicable law, IntelliBase AI's total liability to you for any claims arising from or related to your use of this service shall not exceed the total amount you have paid to us in the 3 (three) calendar months preceding the date the claim is submitted. This limitation applies regardless of the form of action, whether based in contract, tort, or any other legal theory." },
      { title: "14. Exclusion of Indirect Damages", body: "We are not liable for indirect, incidental, special, consequential, or punitive damages, including but not limited to: loss of business profits, data loss, business interruption, or reputational harm, arising from your use of or inability to use this service, even if we have been advised of the possibility of such damages. Users are solely responsible for business decisions made based on the service's output." },
      { title: "15. AI-Specific Disclaimer", body: "Output generated by the IntelliBase AI system is automated based on documents you upload and does not constitute professional advice in legal, financial, medical, or any other field requiring professional licensing. We are not responsible for any consequences arising from the use of or reliance on AI output. Users must independently verify information and consult qualified professionals before making important decisions." },
      { title: "16. Force Majeure", body: "We are not liable for delays or failures in performing our obligations caused by circumstances beyond our reasonable control, including but not limited to: natural disasters, power outages, internet infrastructure failures, cyber attacks on third-party service providers, government regulations, pandemics, or other events generally classified as force majeure." },
      { title: "17. User Indemnification", body: "You agree to indemnify, defend, and hold harmless IntelliBase AI and its officers, directors, employees, and agents from and against any claims, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from: (a) your breach of these Terms and Conditions; (b) your use of the service in violation of law or third-party rights; (c) content or documents you upload to the platform." },
      { title: "18. Contact", body: "For questions about these terms, contact us at: hello@intellibaseai.com" },
    ],
  },
};

export default function TermsPage() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <Link href="/"><LogoFull size="sm" /></Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="text-sm text-blue-600 hover:underline">{T.login}</Link>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-2">{T.title}</h1>
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
