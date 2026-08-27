"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { getPlanPrice, isPromoActive } from "@/lib/pricing";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { ROI_DEFAULTS, calculateRoi, ESTIMATE_NOTE, RECOVERED_SHARE_LABEL } from "@/lib/roi";
import { FEATURED_INDUSTRY, OTHER_INDUSTRIES } from "@/lib/industries";
import { SUPPORT_EMAIL, FOUNDER, consultationMailto, whatsappUrl } from "@/lib/contact";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Users, FileText, MessageSquare, Calculator, Play, Mail, Check, User, Building2 } from "lucide-react";

// https://youtu.be/DPUYHnEo0cM — product demo, must stay public on YouTube for
// the embed and its thumbnail to resolve.
const DEMO_VIDEO_ID = "DPUYHnEo0cM";

// Product screenshots for the "how it works" steps, keyed by name rather than
// step order — each translation's step names which shot it wants (see `Step`
// below). They sit outside CONTENT because the images are the same in both
// languages, and repeating them per translation is how they drift apart.
//
// Imported rather than referenced by path so Next reads each file's real
// dimensions at build time: nothing here has to restate them, they cannot drift
// from the files, and a deleted or renamed screenshot breaks the build instead
// of quietly shipping a gap in the page.
import uploadDocumentsShot from "../../public/screenshots/upload-documents.png";
import inviteEmployeesShot from "../../public/screenshots/invite-employees.png";
import askAndAnswerShot from "../../public/screenshots/ask-and-answer.png";
// The individual flow gets its own pair rather than reusing the company shots.
// Two steps that read identically in prose look nothing alike on screen: the
// company dashboard shows departments and an employee list, and putting that
// under copy about personal folders tells a visitor the tier is a team product
// with the team hidden. These were taken from a real individual account after
// the wording fix in PR #100 — the earlier attempt still said "kebijakan
// perusahaan" in the chat box, which is exactly the impression to avoid.
import personalUploadShot from "../../public/screenshots/personal-upload.png";
import personalAskShot from "../../public/screenshots/personal-ask.png";

const STEP_SHOTS = {
  upload: uploadDocumentsShot,
  invite: inviteEmployeesShot,
  ask: askAndAnswerShot,
  uploadPersonal: personalUploadShot,
  askPersonal: personalAskShot,
};

// Each step names its own screenshot instead of being paired to one by array
// position. Position pairing has no way to complain: reorder the steps and every
// screenshot silently describes the wrong step, add a fourth step and there is no
// fourth image, so `shot.width` throws and takes the whole landing page with it
// (this is a client component). Naming makes both mistakes a type error at the
// step itself — which is what `satisfies Step[]` on each translation below is for.
type Step = {
  n: string;
  shot: keyof typeof STEP_SHOTS;
  t: string;
  d: string;
  icon: typeof FileText;
};

// A stat we assume rather than measure sets `estimate`. The marker and the
// footnote are both rendered from that flag, so a figure cannot end up starred
// with no note or hedged with no star — and the copy stays free of the marker,
// which a screen reader would otherwise read out as part of the label.
type Stat = { v: string; l: string; estimate?: true };

const STATS_NOTE_ID = "landing-stats-estimate-note";

// The "how it works" section's own geometry, needed to describe each
// screenshot's rendered width to the browser. `sizes` has to state the width the
// image is *laid out* at, not the width of the file: claiming 1864px when the
// container never exceeds 1280px makes the browser fetch a variant two steps
// larger than it can ever display.
const HOW_CONTENT_MAX = 1280; // max-w-7xl
const HOW_PADDING_X = 48; // px-6, both sides

// Rendered width is the smallest of: the container cap, the viewport minus this
// section's padding, and the screenshot's own pixels (never upscale).
function shotSizes(intrinsicWidth: number): string {
  const cap = Math.min(HOW_CONTENT_MAX, intrinsicWidth);
  return `(min-width: ${cap + HOW_PADDING_X}px) ${cap}px, calc(100vw - ${HOW_PADDING_X}px)`;
}

const CONTENT = {
  id: {
    badge: "🚀 Platform Knowledge Base AI untuk Perusahaan Indonesia",
    hero1: "Karyawan Anda Bisa Tahu Semua",
    hero2: "Kebijakan Perusahaan",
    hero3: "dalam Detik",
    heroDesc: "IntelliBase AI mengubah dokumen SOP, regulasi HR, panduan IT, clinical pathway rumah sakit, kebijakan keuangan, kontrak, manual produk, dan dokumen internal lainnya menjadi asisten AI yang bisa menjawab pertanyaan karyawan secara instan — kapanpun, dimanapun.",
    cta1: "Mulai Gratis Sekarang",
    cta2: "Lihat Paket Harga",
    ctaNote: "Gratis selamanya untuk tim kecil · Tidak perlu kartu kredit",
    videoTitle: "Lihat IntelliBase AI Bekerja",
    videoDesc: "Demo singkat: dari upload dokumen sampai karyawan mendapat jawaban instan.",
    videoPlay: "Putar video demo",
    stats: [
      // Not the per-question reduction — that number is far bigger and far less
      // honest. This is the share of a month's search cost still standing after
      // all three of the calculator's discounts.
      { v: RECOVERED_SHARE_LABEL, l: "Estimasi biaya waktu pencarian yang bisa dipulihkan", estimate: true },
      { v: "< 3 detik", l: "Rata-rata waktu respons AI", estimate: true },
      { v: "100%", l: "Isolasi data antar perusahaan" },
      { v: "10 menit", l: "Waktu setup hingga siap pakai" },
    ] satisfies Stat[],
    problemTitle: "Masalahnya Bukan Karyawan Anda",
    problemDesc: "Ini yang biasanya terjadi setiap hari sebelum ada satu tempat untuk bertanya.",
    problemPoints: [
      "Karyawan baru menghabiskan berjam-jam mencari SOP yang benar — atau menebak-nebak lewat rekan kerja yang belum tentu tahu jawabannya.",
      "Kebijakan tersebar di email, folder bersama, dan grup chat. Versi mana yang terbaru sering jadi tebakan.",
      "Admin HR dan IT dibanjiri pertanyaan berulang yang jawabannya sebenarnya sudah ada di dokumen resmi.",
    ],
    // "Cocok untuk", not "dipakai oleh": we have no customers in these
    // industries to point at yet, and the row only claims the product fits
    // their documents — which is what the doc types under each name show.
    industriesTitle: "Juga cocok untuk industri lain",
    industriesDesc: "Setiap industri punya istilah dokumennya sendiri. AI menjawab dari dokumen resmi Anda, apapun namanya.",
    industriesMore: "Selengkapnya",
    howTitle: "Cara Kerja IntelliBase",
    howDesc: "Setup dalam 10 menit, langsung bisa digunakan seluruh tim",
    steps: [
      { n: "1", shot: "upload", t: "Upload Dokumen", d: "Admin upload SOP, regulasi HR, panduan IT, atau clinical pathway dalam format PDF, DOCX, Excel, atau PowerPoint. AI langsung mengindeks.", icon: FileText },
      { n: "2", shot: "invite", t: "Undang Karyawan", d: "Tambahkan akun karyawan dari dashboard. Mereka bisa langsung login dan mulai bertanya.", icon: Users },
      { n: "3", shot: "ask", t: "Tanya & Dapat Jawaban", d: "Karyawan ketik pertanyaan di chat. AI menjawab berdasarkan dokumen resmi perusahaan, lengkap dengan daftar dokumen sumber yang bisa dibuka untuk mengecek.", icon: MessageSquare },
    ] satisfies Step[],
    priceTitle: "Harga yang Transparan",
    priceDesc: "Mulai gratis, upgrade ketika tim Anda berkembang. Tidak ada biaya tersembunyi.",
    pricePlans: [
      { name: "Starter", price: "Gratis", desc: "5 karyawan · 10 dokumen · pencarian" },
      { name: "Professional", price: "Rp 200rb/bln", desc: "50 karyawan · 100 dokumen", promo: true },
      { name: "Enterprise", price: "Rp 500rb/bln", desc: "100 karyawan · 300 dokumen", promo: true },
      { name: "Custom", price: "Hubungi kami", desc: "Grup RS & multi-cabang" },
    ],
    priceBtn: "Lihat Detail Harga",
    // Every answer here is checked against what the product actually does and
    // against /privacy — this is the section a cautious buyer reads hardest, so
    // a claim that overshoots costs more here than anywhere else on the page.
    faqTitle: "Pertanyaan yang Biasanya Muncul Duluan",
    faqDesc: "Sebelum mengunggah dokumen internal, ini biasanya yang ingin dipastikan lebih dulu.",
    faq: [
      {
        q: "Dokumen internal kami disimpan di mana, dan siapa yang bisa membukanya?",
        a: "Dokumen disimpan di database PostgreSQL (Neon) dengan seluruh koneksi terenkripsi TLS. Setiap perusahaan punya ruang datanya sendiri yang dipisahkan di level database, bukan sekadar difilter di aplikasi — jadi pertanyaan karyawan Anda tidak pernah bisa menyentuh dokumen perusahaan lain. Di dalam perusahaan Anda sendiri, admin yang menentukan dokumen mana bisa diakses departemen mana.",
      },
      {
        q: "Apakah dokumen kami dipakai untuk melatih AI?",
        a: "IntelliBase tidak melatih model AI apa pun dengan dokumen Anda, dan tidak menjual atau membagikannya ke perusahaan lain. Yang perlu Anda tahu apa adanya: saat dokumen diunggah, isinya dikirim ke Google (Gemini API) untuk diubah menjadi indeks pencarian, dan saat pertanyaan dijawab, potongan teks yang relevan dikirim ke Groq. Groq menyatakan tidak memakai data API pelanggan untuk melatih modelnya. Akun Gemini kami saat ini masih di tier gratis, dan ketentuan Google untuk tier itu mengizinkan mereka memakai konten untuk meningkatkan layanannya. Kalau kebijakan dokumen perusahaan Anda tidak mengizinkan hal tersebut, hubungi kami sebelum mengunggah — pemrosesan bisa dipindahkan ke tier berbayar yang tidak memakai konten pelanggan. Rincian lengkapnya ada di Kebijakan Privasi.",
      },
      {
        q: "Bagaimana kalau AI-nya mengarang jawaban?",
        a: "Setiap jawaban datang dengan daftar dokumen sumbernya — nama dokumen beserta potongan teks yang dipakai — sehingga jawaban selalu bisa dicek ke dokumen aslinya. Kalau tidak ada dokumen perusahaan yang relevan dengan pertanyaan, AI menyatakan tidak menemukannya, bukan menebak dari pengetahuan umum internet.",
      },
      {
        q: "Kalau kami berhenti berlangganan, dokumen kami hilang?",
        a: "Tidak dihapus. Ada masa tenggang 7 hari setelah masa aktif berakhir, di mana batas paket lama Anda masih berlaku penuh. Setelah itu batas paket Starter yang berlaku, dan dokumen di atas batas itu dibekukan — tersimpan tetapi tidak ikut dicari — sampai Anda memperpanjang. Kalau Anda memang ingin data dihapus, penghapusan akun menghapus seluruh data dalam 30 hari.",
      },
      {
        q: "Siapa yang bisa melihat pertanyaan yang diajukan karyawan?",
        a: "Admin perusahaan Anda bisa melihat pertanyaan-pertanyaan yang masuk lewat menu Analytics — memang dirancang begitu, supaya Anda tahu dokumen mana yang paling sering dicari dan mana yang ternyata belum ada. Kami sarankan menyampaikan hal ini ke karyawan sejak awal.",
      },
      {
        q: "Format dokumen apa saja yang didukung, dan berapa lama setupnya?",
        a: "PDF, DOCX, Excel, dan PowerPoint. Dokumen diindeks otomatis begitu diunggah — tidak ada tagging manual — dan sebagian besar perusahaan sudah bisa mulai bertanya dalam waktu sekitar 10 menit sejak akun dibuat.",
      },
      {
        q: "Bisa dicoba dulu tanpa bayar?",
        a: "Bisa. Paket Starter gratis selamanya untuk 5 karyawan dan 10 dokumen, tanpa kartu kredit. Kalau ingin mencoba dengan dokumen asli perusahaan tapi ragu memulai sendiri, kirim email ke kami dan kami bantu menyiapkannya.",
      },
    ],
    founderTitle: "Siapa di balik IntelliBase",
    faqMore: "Masih ada yang ingin ditanyakan?",
    faqMoreCta: "Email kami langsung",
    privacyLink: "Baca Kebijakan Privasi",
    ctaTitle: "Mulai Transformasi Knowledge Base Anda Hari Ini",
    ctaDesc: "Gratis untuk tim kecil. Setup 10 menit. Tidak perlu kartu kredit.",
    ctaBtn1: "Mulai Gratis Sekarang",
    ctaBtn2: "Konsultasi Gratis Dulu",
    // The register button assumes a visitor ready to hand over documents. This
    // is the exit for everyone else — cheaper than signing up, and the only way
    // an unconvinced visitor leaves a trace instead of just leaving.
    consult: "Belum yakin? Konsultasi gratis dulu",
    consultNote: "Balasan lewat email · Tanpa biaya, tanpa komitmen",
    leadLabel: "Atau tinggalkan email, kami hubungi lebih dulu",
    leadPlaceholder: "email@perusahaan.com",
    leadBtn: "Kirim",
    leadSuccess: "Terima kasih — kami akan menghubungi Anda.",
    leadError: "Gagal mengirim. Coba lagi sebentar lagi.",
    roiTeaser: {
      badge: "💡 Hitung Sendiri",
      title: "Berapa Kerugian Perusahaan Anda Setiap Bulan?",
      desc: "Geser slider untuk melihat estimasi biaya waktu yang terbuang karyawan Anda saat mencari dokumen internal.",
      label: "Jumlah Karyawan",
      // Was hardcoded next to the slider value, so the English page counted its
      // headcount in "orang".
      unit: "orang",
      lostLabel: "Nilai waktu pencarian / bulan",
      // "Potensi" invited the reader to imagine the ceiling. This figure is
      // already the floor of our own model — say so, and let the calculator
      // page show the working.
      savingLabel: "Estimasi hemat setelah asumsi konservatif",
      cta: "Hitung Penghematan Lengkap",
      ctaNote: "Gratis · Tidak perlu daftar · Lengkap dengan asumsi perhitungannya",
    },
    // Labels for the audience switch. They live in the shared copy because the
    // control itself is shared — it has to be on screen in both modes for the
    // visitor to get back. Only the hint underneath changes.
    audienceIndividual: "Individu",
    audienceCompany: "Perusahaan",
    audienceHint: "Untuk tim: kelola karyawan, akses dokumen per departemen, dan analitik tim.",
    nav: { price: "Harga", login: "Masuk", start: "Mulai Gratis", roi: "Kalkulator ROI", blog: "Blog" },
    footer: { price: "Harga", login: "Masuk", register: "Daftar", terms: "Syarat & Ketentuan", privacy: "Privasi", roi: "Kalkulator ROI", contact: "Kontak", blog: "Blog" },
  },
  en: {
    badge: "🚀 AI Knowledge Base Built for Indonesian Businesses",
    hero1: "Your Employees Can Know All",
    hero2: "Company Policies",
    hero3: "in Seconds",
    heroDesc: "IntelliBase AI transforms your SOPs, HR regulations, IT guidelines, hospital clinical pathways, finance policies, contracts, product manuals, and any internal documents into an AI assistant that answers employee questions instantly — anytime, anywhere.",
    cta1: "Start Free Now",
    cta2: "View Pricing",
    ctaNote: "Free forever for small teams · No credit card required",
    videoTitle: "See IntelliBase AI in Action",
    videoDesc: "A short demo: from uploading documents to employees getting instant answers.",
    videoPlay: "Play demo video",
    stats: [
      { v: RECOVERED_SHARE_LABEL, l: "Estimated share of search cost recoverable", estimate: true },
      { v: "< 3 sec", l: "Average AI response time", estimate: true },
      { v: "100%", l: "Data isolation between companies" },
      { v: "10 min", l: "Setup time until ready" },
    ] satisfies Stat[],
    problemTitle: "It's Not Your Employees — It's the Search",
    problemDesc: "This is what usually happens every day before there's one place to ask.",
    problemPoints: [
      "New hires spend hours hunting for the right SOP — or guess by asking a coworker who may not know either.",
      "Policies are scattered across email, shared folders, and group chats. Which version is current is often a guess.",
      "HR and IT admins get flooded with the same repeat questions that already have an answer sitting in an official document.",
    ],
    industriesTitle: "Also fits other industries",
    industriesDesc: "Every industry has its own document vocabulary. The AI answers from your official documents, whatever you call them.",
    industriesMore: "Learn more",
    howTitle: "How IntelliBase Works",
    howDesc: "Setup in 10 minutes, ready for the whole team immediately",
    steps: [
      { n: "1", shot: "upload", t: "Upload Documents", d: "Admin uploads SOPs, HR regulations, IT guidelines, or clinical pathways in PDF, DOCX, Excel, or PowerPoint format. AI indexes immediately.", icon: FileText },
      { n: "2", shot: "invite", t: "Invite Employees", d: "Add employee accounts from the dashboard. They can log in and start asking questions right away.", icon: Users },
      { n: "3", shot: "ask", t: "Ask & Get Answers", d: "Employees type questions in chat. The AI answers from official company documents, listing the source documents they can open to check.", icon: MessageSquare },
    ] satisfies Step[],
    priceTitle: "Transparent Pricing",
    priceDesc: "Start free, upgrade as your team grows. No hidden fees.",
    pricePlans: [
      { name: "Starter", price: "Free", desc: "5 employees · 10 documents · search" },
      { name: "Professional", price: "Rp 200k/mo", desc: "50 employees · 100 documents", promo: true },
      { name: "Enterprise", price: "Rp 500k/mo", desc: "100 employees · 300 documents", promo: true },
      { name: "Custom", price: "Contact us", desc: "Hospital groups & multi-site" },
    ],
    priceBtn: "View Full Pricing",
    faqTitle: "The Questions That Come Up First",
    faqDesc: "Before uploading internal documents, this is usually what people want settled.",
    faq: [
      {
        q: "Where are our internal documents stored, and who can open them?",
        a: "Documents are stored in a PostgreSQL database (Neon), with every connection encrypted over TLS. Each company gets its own data space, separated at the database level rather than merely filtered in the application — so your employees' questions can never reach another company's documents. Within your own company, your admin decides which departments can access which documents.",
      },
      {
        q: "Are our documents used to train the AI?",
        a: "IntelliBase does not train any AI model on your documents, and does not sell or share them with other companies. What you should know plainly: when a document is uploaded, its contents are sent to Google (Gemini API) to be turned into a search index, and when a question is answered, the relevant excerpts are sent to Groq. Groq states that it does not use customer API data to train its models. Our Gemini account is currently on the free tier, and Google's terms for that tier allow them to use content to improve their services. If your company's document policy does not permit that, contact us before uploading — processing can be moved to a paid tier that does not use customer content. The full detail is in our Privacy Policy.",
      },
      {
        q: "What if the AI makes an answer up?",
        a: "Every answer arrives with its source documents listed — the document name plus the excerpt it used — so any answer can be checked against the original. When no company document is relevant to the question, the AI says it could not find one rather than guessing from general internet knowledge.",
      },
      {
        q: "If we stop subscribing, do we lose our documents?",
        a: "Nothing is deleted. There is a 7-day grace period after expiry during which your previous plan's limits still apply in full. After that the Starter limits apply, and documents above that limit are frozen — still stored, but left out of search — until you renew. If you do want your data gone, deleting your account removes everything within 30 days.",
      },
      {
        q: "Who can see the questions employees ask?",
        a: "Your company's admin can see the questions that come in, via the Analytics tab — that is by design, so you can see which documents are searched most and which ones turn out to be missing. We recommend telling your employees this up front.",
      },
      {
        q: "Which document formats are supported, and how long is setup?",
        a: "PDF, DOCX, Excel, and PowerPoint. Documents are indexed automatically on upload — no manual tagging — and most companies are asking their first questions within about 10 minutes of creating an account.",
      },
      {
        q: "Can we try it without paying?",
        a: "Yes. The Starter plan is free forever for 5 employees and 10 documents, no credit card. If you would rather try it with your real documents but do not want to set it up alone, email us and we will help you get started.",
      },
    ],
    founderTitle: "Who is behind IntelliBase",
    faqMore: "Still have a question?",
    faqMoreCta: "Email us directly",
    privacyLink: "Read the Privacy Policy",
    ctaTitle: "Start Transforming Your Knowledge Base Today",
    ctaDesc: "Free for small teams. 10-minute setup. No credit card required.",
    ctaBtn1: "Start Free Now",
    ctaBtn2: "Talk to Us First",
    consult: "Not sure yet? Book a free consultation",
    consultNote: "We reply by email · Free, no commitment",
    leadLabel: "Or leave your email and we'll reach out first",
    leadPlaceholder: "email@company.com",
    leadBtn: "Send",
    leadSuccess: "Thanks — we'll be in touch.",
    leadError: "Something went wrong. Please try again shortly.",
    roiTeaser: {
      badge: "💡 Calculate Yourself",
      title: "How Much Is Your Company Losing Every Month?",
      desc: "Drag the slider to see the estimated cost of time wasted when employees manually search for internal documents.",
      label: "Number of Employees",
      unit: "people",
      lostLabel: "Value of search time / month",
      savingLabel: "Estimated savings after conservative assumptions",
      cta: "Calculate Full Savings",
      ctaNote: "Free · No sign-up required · Assumptions shown in full",
    },
    audienceIndividual: "Individual",
    audienceCompany: "Company",
    audienceHint: "For a team: manage employees, department-level document access, and team analytics.",
    nav: { price: "Pricing", login: "Sign In", start: "Start Free", roi: "ROI Calculator", blog: "Blog" },
    footer: { price: "Pricing", login: "Sign In", register: "Register", terms: "Terms", privacy: "Privacy", roi: "ROI Calculator", contact: "Contact", blog: "Blog" },
  },
};

// What the page says when the visitor is one person rather than a company.
//
// Overrides, not a second page. Only the keys that would otherwise be wrong are
// here, and the renderer spreads them over CONTENT — so the company page keeps
// rendering byte-for-byte what it rendered before, and anything shared (the
// navbar, the demo, the founder block, the footer) has exactly one copy.
//
// Two sections are dropped rather than rewritten, in the renderer below: the
// industries band, whose whole premise is an organisation's document set, and
// the ROI teaser, which prices a month of one company's wasted search time
// against its headcount. A slider reading "1 orang" is not a smaller version of
// that argument, it is a different argument we have not made.
//
// Quota figures come from PLAN_LIMITS for the reason every other number in the
// copy does: a limit changed in one file must not leave a promise standing in
// another.
const INDIVIDUAL_CONTENT = {
  id: {
    badge: "🚀 Knowledge Base AI untuk Pemakaian Pribadi",
    hero1: "Semua Dokumen Anda,",
    hero2: "Bisa Ditanya",
    hero3: "Kapan Saja",
    heroDesc: "Catatan kuliah, jurnal, panduan kerja, kontrak, materi pelatihan, manual alat — kumpulkan di satu tempat, lalu tanyakan isinya seperti mengobrol. Setiap jawaban menyebut dokumen sumbernya, jadi selalu bisa dicek.",
    ctaNote: "Gratis selamanya · Tanpa kartu kredit · Tanpa kelola karyawan",
    videoTitle: "Lihat IntelliBase AI Bekerja",
    videoDesc: "Demo singkat: dari upload dokumen sampai jawaban muncul lengkap dengan sumbernya.",
    // Nothing here is a claim we cannot back. The three hard numbers are plan
    // limits and file formats — facts about the product, not results attributed
    // to it — and the only estimate carries the marker that footnotes it.
    stats: [
      { v: "4 format", l: "PDF, DOCX, Excel, PowerPoint" },
      { v: `${PLAN_LIMITS.personal.maxDocuments} dokumen`, l: "Kapasitas paket Personal" },
      { v: "Hanya Anda", l: "Yang bisa membuka dokumen Anda" },
      { v: "10 menit", l: "Waktu setup hingga siap pakai", estimate: true },
    ] satisfies Stat[],
    problemTitle: "Rasanya Familiar?",
    problemDesc: "Ini yang biasanya terjadi sebelum semua dokumen Anda ada di satu tempat yang bisa ditanya.",
    problemPoints: [
      "Catatan kuliah, kontrak, dan manual alat tersebar di banyak folder dan aplikasi berbeda.",
      "Ctrl+F menemukan kata yang tepat, tapi tidak menemukan maknanya — jadi Anda tetap harus membaca ulang halaman demi halaman.",
      "Detail kecil yang sebenarnya sudah pernah Anda baca, harus dicari ulang dari awal setiap kali lupa.",
    ],
    howTitle: "Cara Kerjanya",
    howDesc: "Dua langkah. Tidak ada yang perlu disiapkan untuk orang lain.",
    // Two steps, not three. The company flow's middle step is inviting
    // employees, and there is no one-person version of it — padding the list
    // back to three would mean inventing a step or reusing the screenshot of a
    // dialog this account never opens.
    steps: [
      { n: "1", shot: "uploadPersonal", t: "Upload Dokumen Anda", d: "Tarik file PDF, DOCX, Excel, atau PowerPoint ke dashboard. Beri nama folder kalau ingin dirapikan — misalnya Riset, Keuangan, atau Kuliah. AI langsung mengindeksnya.", icon: FileText },
      { n: "2", shot: "askPersonal", t: "Tanya & Dapat Jawaban", d: "Ketik pertanyaan di chat. AI menjawab dari dokumen Anda sendiri, lengkap dengan nama dokumen sumbernya — dan bisa dibatasi ke satu folder saja kalau pertanyaannya spesifik.", icon: MessageSquare },
    ] satisfies Step[],
    priceTitle: "Harga untuk Pemakaian Pribadi",
    priceDesc: "Mulai gratis. Naik ke Personal saat dokumen dan pertanyaan Anda bertambah.",
    pricePlans: [
      { name: "Starter", price: "Gratis", desc: `${PLAN_LIMITS.starter.maxDocuments} dokumen · pencarian dokumen` },
      { name: "Personal", price: "", desc: `${PLAN_LIMITS.personal.maxDocuments} dokumen · pertanyaan bulanan tanpa batas` },
    ],
    faqDesc: "Sebelum mengunggah dokumen pribadi, ini biasanya yang ingin dipastikan lebih dulu.",
    faq: [
      {
        q: "Dokumen saya disimpan di mana, dan siapa yang bisa membukanya?",
        a: "Dokumen disimpan di database PostgreSQL (Neon) dengan seluruh koneksi terenkripsi TLS. Setiap akun punya ruang datanya sendiri yang dipisahkan di level database, bukan sekadar difilter di aplikasi. Di akun individu tidak ada admin lain dan tidak ada rekan tim — hanya akun Anda sendiri yang bisa membuka dokumen Anda.",
      },
      {
        // Same disclosure as the company page, and it stays in full. The
        // free-tier caveat is the one thing a person uploading their own
        // documents has the most right to know before they do it.
        q: "Apakah dokumen saya dipakai untuk melatih AI?",
        a: "IntelliBase tidak melatih model AI apa pun dengan dokumen Anda, dan tidak menjual atau membagikannya. Yang perlu Anda tahu apa adanya: saat dokumen diunggah, isinya dikirim ke Google (Gemini API) untuk diubah menjadi indeks pencarian, dan saat pertanyaan dijawab, potongan teks yang relevan dikirim ke Groq. Groq menyatakan tidak memakai data API pelanggan untuk melatih modelnya. Akun Gemini kami saat ini masih di tier gratis, dan ketentuan Google untuk tier itu mengizinkan mereka memakai konten untuk meningkatkan layanannya. Kalau dokumen Anda bersifat rahasia atau terikat kewajiban kerahasiaan, hubungi kami sebelum mengunggah. Rincian lengkapnya ada di Kebijakan Privasi.",
      },
      {
        q: "Bagaimana kalau AI-nya mengarang jawaban?",
        a: "Setiap jawaban datang dengan daftar dokumen sumbernya — nama dokumen beserta potongan teks yang dipakai — sehingga jawaban selalu bisa dicek ke dokumen aslinya. Kalau tidak ada dokumen Anda yang relevan dengan pertanyaan, AI menyatakan tidak menemukannya, bukan menebak dari pengetahuan umum internet.",
      },
      {
        q: "Apa bedanya akun Individu dan akun Perusahaan?",
        a: "Akun individu untuk satu orang: dokumen pribadi, folder yang Anda atur sendiri, tanpa manajemen karyawan sama sekali. Akun perusahaan punya admin dan karyawan, akses dokumen per departemen, serta analitik tim. Jenis akun dipilih sekali saat mendaftar dan tidak bisa diubah setelahnya — kalau nanti Anda butuh mengajak tim, daftarkan akun perusahaan baru.",
      },
      {
        q: "Kalau saya berhenti berlangganan, dokumen saya hilang?",
        a: "Tidak dihapus. Ada masa tenggang 7 hari setelah masa aktif berakhir, di mana batas paket lama Anda masih berlaku penuh. Setelah itu batas paket Starter yang berlaku, dan dokumen di atas batas itu dibekukan — tersimpan tetapi tidak ikut dicari — sampai Anda memperpanjang. Kalau Anda memang ingin data dihapus, penghapusan akun menghapus seluruh data dalam 30 hari.",
      },
      {
        q: "Format dokumen apa saja yang didukung, dan berapa lama setupnya?",
        a: "PDF, DOCX, Excel, dan PowerPoint. Dokumen diindeks otomatis begitu diunggah — tidak ada tagging manual — dan sebagian besar orang sudah bisa mulai bertanya dalam waktu sekitar 10 menit sejak akun dibuat.",
      },
      {
        q: "Bisa dicoba dulu tanpa bayar?",
        a: `Bisa. Paket Starter gratis selamanya untuk ${PLAN_LIMITS.starter.maxDocuments} dokumen dan ${PLAN_LIMITS.starter.maxQuestionsPerMonth} pertanyaan per bulan, tanpa kartu kredit.`,
      },
    ],
    ctaTitle: "Mulai Bangun Knowledge Base Pribadi Anda",
    ctaDesc: "Gratis untuk mulai. Setup 10 menit. Tanpa kartu kredit.",
    audienceHint: "Untuk satu orang: dokumen pribadi dan folder sendiri, tanpa kelola karyawan.",
  },
  en: {
    badge: "🚀 An AI Knowledge Base for Personal Use",
    hero1: "Every Document You Own,",
    hero2: "Ready to Answer",
    hero3: "Any Time",
    heroDesc: "Lecture notes, papers, work guides, contracts, training material, equipment manuals — keep them in one place, then ask what is in them as if you were chatting. Every answer names the document it came from, so you can always check it.",
    ctaNote: "Free forever · No credit card · No employees to manage",
    videoTitle: "See IntelliBase AI in Action",
    videoDesc: "A short demo: from uploading a document to an answer that cites its source.",
    stats: [
      { v: "4 formats", l: "PDF, DOCX, Excel, PowerPoint" },
      { v: `${PLAN_LIMITS.personal.maxDocuments} documents`, l: "Personal plan capacity" },
      { v: "Only you", l: "Can open your documents" },
      { v: "10 min", l: "Setup time until ready", estimate: true },
    ] satisfies Stat[],
    problemTitle: "Sound Familiar?",
    problemDesc: "This is what usually happens before every document you own lives in one place you can just ask.",
    problemPoints: [
      "Lecture notes, contracts, and equipment manuals scattered across different folders and apps.",
      "Ctrl+F finds the right word, but not the right meaning — so you still end up rereading page after page.",
      "A small detail you already read once has to be hunted down again from scratch every time you forget it.",
    ],
    howTitle: "How It Works",
    howDesc: "Two steps. Nothing to set up on anyone else's behalf.",
    steps: [
      { n: "1", shot: "uploadPersonal", t: "Upload Your Documents", d: "Drop PDF, DOCX, Excel or PowerPoint files onto the dashboard. Name a folder if you want them tidy — Research, Finance, Coursework. The AI indexes them straight away.", icon: FileText },
      { n: "2", shot: "askPersonal", t: "Ask and Get Answers", d: "Type a question in the chat. The AI answers from your own documents and names the ones it used — and you can narrow a specific question to a single folder.", icon: MessageSquare },
    ] satisfies Step[],
    priceTitle: "Pricing for Personal Use",
    priceDesc: "Start free. Move to Personal when your documents and questions outgrow it.",
    pricePlans: [
      { name: "Starter", price: "Free", desc: `${PLAN_LIMITS.starter.maxDocuments} documents · document search` },
      { name: "Personal", price: "", desc: `${PLAN_LIMITS.personal.maxDocuments} documents · unlimited questions per month` },
    ],
    faqDesc: "Before uploading personal documents, this is usually what people want settled first.",
    faq: [
      {
        q: "Where are my documents stored, and who can open them?",
        a: "Documents are stored in a PostgreSQL database (Neon), with every connection encrypted over TLS. Each account gets its own data space, separated at the database level rather than merely filtered in the application. An individual account has no other admin and no colleagues — only your own account can open your documents.",
      },
      {
        q: "Are my documents used to train AI?",
        a: "IntelliBase does not train any AI model on your documents, and does not sell or share them. What you should know plainly: when a document is uploaded its contents go to Google (Gemini API) to be turned into a search index, and when a question is answered the relevant excerpts go to Groq. Groq states that it does not use customer API data to train its models. Our Gemini account is currently on the free tier, and Google's terms for that tier allow them to use content to improve their services. If your documents are confidential or under a duty of confidence, contact us before uploading. The full detail is in the Privacy Policy.",
      },
      {
        q: "What if the AI makes an answer up?",
        a: "Every answer comes with the documents it drew on — the document name and the excerpt used — so any answer can be checked against the original. If none of your documents is relevant to the question, the AI says it could not find an answer rather than guessing from general internet knowledge.",
      },
      {
        q: "What is the difference between an Individual and a Company account?",
        a: "An individual account is for one person: personal documents, folders you arrange yourself, and no employee management at all. A company account has an admin and employees, department-level document access, and team analytics. The account type is chosen once at sign-up and cannot be changed afterwards — if you later need to bring in a team, register a new company account.",
      },
      {
        q: "If I stop subscribing, do I lose my documents?",
        a: "Nothing is deleted. There is a 7-day grace period after your plan ends, during which your old plan's limits still apply in full. After that the Starter limits apply and documents above that limit are frozen — kept, but left out of search — until you renew. If you do want your data gone, deleting your account removes everything within 30 days.",
      },
      {
        q: "Which document formats are supported, and how long is setup?",
        a: "PDF, DOCX, Excel, and PowerPoint. Documents are indexed automatically on upload — no manual tagging — and most people are asking questions within about 10 minutes of creating an account.",
      },
      {
        q: "Can I try it without paying?",
        a: `Yes. The Starter plan is free forever for ${PLAN_LIMITS.starter.maxDocuments} documents and ${PLAN_LIMITS.starter.maxQuestionsPerMonth} questions a month, with no credit card.`,
      },
    ],
    ctaTitle: "Start Building Your Personal Knowledge Base",
    ctaDesc: "Free to start. 10-minute setup. No credit card.",
    audienceHint: "For one person: personal documents and your own folders, no employees to manage.",
  },
};

function formatRp(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)} M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} jt`;
  return `Rp ${(v / 1_000).toFixed(0)}rb`;
}

// The player is only mounted once the visitor clicks play, so a landing page
// visit costs a single thumbnail instead of the ~1MB the YouTube embed pulls in.
// maxresdefault only exists for uploads of 720p and above; hqdefault always does.
function DemoVideo({ title, desc, playLabel }: { title: string; desc: string; playLabel: string }) {
  const [playing, setPlaying] = useState(false);
  const [thumbFallback, setThumbFallback] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${DEMO_VIDEO_ID}/${thumbFallback ? "hqdefault" : "maxresdefault"}.jpg`;

  return (
    // pt of its own rather than borrowing the previous section's: this used to
    // sit directly under the hero and lean on its py-24, which quietly made the
    // spacing here a property of whatever happens to be rendered above.
    <section className="pt-10 pb-14 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-7">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{title}</h2>
          <p className="text-gray-500">{desc}</p>
        </div>
        <div className="relative aspect-video rounded-2xl overflow-hidden border shadow-sm bg-gray-900">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={playLabel}
              className="group absolute inset-0 h-full w-full cursor-pointer"
            >
              <Image
                src={thumb}
                alt=""
                fill
                sizes="(max-width: 896px) 100vw, 896px"
                className="object-cover"
                onError={() => setThumbFallback(true)}
              />
              <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/10" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 shadow-lg transition-transform group-hover:scale-110">
                <Play className="h-7 w-7 text-white fill-white translate-x-0.5" />
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

type Audience = "individual" | "company";

export function LandingContent() {
  const { lang } = useLang();

  // Company is the default, and that is a decision about what gets indexed as
  // much as about who we sell to. This component is prerendered, so the HTML a
  // crawler receives is whatever the initial state renders — including the FAQ
  // structured data below. Defaulting to company keeps the page Google already
  // knows exactly as it was, and makes the individual copy something a visitor
  // opts into rather than something that quietly replaces it.
  const [audience, setAudience] = useState<Audience>("company");
  const isIndividual = audience === "individual";

  // Spread rather than a second copy object, so every `T.x` below keeps working
  // and the company path renders precisely what it rendered before — the
  // individual set only defines the keys that would otherwise be wrong for one
  // person. A key added to CONTENT and forgotten here falls back to the company
  // wording, which is the safe direction to fail: shared copy stays shared.
  const T = isIndividual ? { ...CONTENT[lang], ...INDIVIDUAL_CONTENT[lang] } : CONTENT[lang];

  // Appended to *every* link out of this page that leads to /register or
  // /pricing, so the tab the visitor chose survives the navigation. Both routes
  // read `type` and treat anything else as a company.
  //
  // Every one, not most: the first version carried it on the hero button, the
  // pricing button and the closing CTA, and left the navbar and footer plain.
  // The navbar's is the teal button that follows the reader down the page —
  // easily the likeliest of the five to be clicked — and it would have dropped
  // the choice silently, landing someone who had just read the individual pitch
  // on a form defaulted to Perusahaan. That is not a tab to get wrong: the
  // account type is fixed at signup and there is no way to change it after.
  const audienceQuery = isIndividual ? "?type=individual" : "";

  const [teaserEmployees, setTeaserEmployees] = useState(ROI_DEFAULTS.employees);
  // Same arithmetic and same assumptions as /roi, with headcount as the only
  // input the visitor moves — so the teaser and the calculator it links to
  // cannot quote different numbers for the same company size.
  const teaser = calculateRoi({ ...ROI_DEFAULTS, employees: teaserEmployees });

  // The bottom CTA's other exit is a mailto link — real, but it hands the
  // visitor off to their own mail client with nothing kept on our side. This
  // is the low-friction alternative: an email stored against this audience
  // and language, for someone not ready to open /register but willing to
  // leave a trace. `leadWebsite` is the honeypot the form below never shows.
  const [leadEmail, setLeadEmail] = useState("");
  const [leadWebsite, setLeadWebsite] = useState("");
  const [leadStatus, setLeadStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  // A ref, not the status above, because the guard has to hold *within* a tick.
  // Two submits fired before React re-renders (Enter pressed twice) both read
  // the same "idle" from the closure and both POST — two rows for one person,
  // and the disabled button never gets a chance to intervene.
  const leadInFlight = useRef(false);

  async function submitLead(e: FormEvent) {
    e.preventDefault();
    if (leadInFlight.current || leadStatus === "done") return;
    leadInFlight.current = true;
    setLeadStatus("loading");

    // Without this a server that accepts the connection and then never answers
    // leaves the form disabled forever: fetch does not reject on its own, so
    // the button stays greyed out with no way back short of reloading.
    //
    // Feature-detected for the same reason /admin does it — AbortSignal.timeout
    // throws on older browsers, and calling it unguarded here would put every
    // one of those visitors straight into the error branch, turning a working
    // form into one that never submits.
    const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(10_000)
      : undefined;

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: leadEmail, audience, locale: lang, website: leadWebsite }),
        signal: timeout,
      });
      setLeadStatus(res.ok ? "done" : "error");
    } catch {
      setLeadStatus("error");
    } finally {
      leadInFlight.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <LogoFull size="sm" className="shrink-0" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {/* The blog is the only surface here written to be found from a
                search rather than from an ad or a link we sent — so it is also
                the only one a visitor may arrive at first. Naming it in the nav
                is what makes the rest of the site reachable from an article,
                and the article reachable from the rest of the site. */}
            <Link href="/blog" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.nav.blog}</Link>
            {/* Dropped on the individual tab for the same reason the ROI teaser
                is: the calculator models a month of a company's wasted search
                time against its headcount. Hiding the section further down
                while leaving a link to the identical argument up here would
                only mean the visitor meets it somewhere less expected. */}
            {!isIndividual && (
              <Link href="/roi" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.nav.roi}</Link>
            )}
            <Link href={`/pricing${audienceQuery}`} className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.nav.price}</Link>
            <Link href="/login"><Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.nav.login}</Button></Link>
            <Link href={`/register${audienceQuery}`}><Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">{T.nav.start}</Button></Link>
          </div>
        </div>
      </nav>

      {/* Audience switch.
          Above the hero, because it changes the hero — a control that reorders
          the page has to be visible before the page makes its first claim, not
          discovered halfway down after the visitor has already decided the
          product is not for them. Same two tabs as /pricing, in the same order,
          so the two pages agree about which side the visitor is on. */}
      <div className="px-6 pt-7">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-2">
          <Tabs value={audience} onValueChange={(v) => setAudience(v as Audience)}>
            <TabsList>
              <TabsTrigger value="individual" className="gap-1.5 px-4">
                <User className="h-4 w-4" />
                {T.audienceIndividual}
              </TabsTrigger>
              <TabsTrigger value="company" className="gap-1.5 px-4">
                <Building2 className="h-4 w-4" />
                {T.audienceCompany}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-gray-400 text-center max-w-md">{T.audienceHint}</p>
        </div>
      </div>

      {/* Hero
          Two columns instead of a centred column, and this is the change that
          buys back the first screen. Centred, the headline had to be text-5xl
          to hold the middle of an empty page, the paragraph needed max-w-2xl to
          stop it running the full width, and py-24 above and below meant one
          sentence occupied everything a visitor saw. Beside an image the same
          words hold their own at a smaller size, and the product appears before
          any scrolling — which is the one thing the old hero never showed. */}
      <section className="px-6 pt-10 pb-12 md:pt-14 md:pb-16">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-14 items-center">
          <div>
            {/* Small, letterspaced, and no pill: a filled badge is a loud way to
                say something quiet. */}
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 mb-5">{T.badge}</p>
            {/* 600, not 700, and tracking pulled in. With one family doing both
                headings and body, weight is the only thing separating them —
                and the old page proved that a 700 headline at this size reads
                as shouting. Semibold with tight tracking keeps the authority
                and drops the volume. */}
            <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] leading-[1.12] text-gray-900 mb-5">
              {T.hero1}{" "}
              <span className="text-teal-700">{T.hero2}</span> {T.hero3}
            </h1>
            <p className="text-base md:text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">{T.heroDesc}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={`/register${audienceQuery}`}>
                <Button size="lg" className="bg-teal-700 hover:bg-teal-800 gap-2 h-12 px-7">{T.cta1} <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              {/* A quiet second path, deliberately not a button: the button above
                  asks a stranger to hand over internal documents before anyone
                  has spoken to them, and that is the wrong first step for most
                  of the companies being pitched. Kept as a text link so it stays
                  an exit for the unconvinced rather than a competing CTA. */}
              <a href={consultationMailto(lang)} className="text-sm text-teal-800 hover:text-teal-900 font-medium underline underline-offset-4 decoration-teal-300">
                {T.consult}
              </a>
            </div>
            <p className="text-xs text-gray-500 mt-5">{T.ctaNote}</p>
          </div>
          {/* The answer screen, not a stock photo: the single most useful thing
              to show someone deciding whether this is real is the product doing
              the thing. Priority because it is the largest element above the
              fold and the page's LCP. */}
          <div className="relative">
            <Image
              src={askAndAnswerShot}
              alt=""
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="w-full h-auto rounded-2xl border border-hairline shadow-sm bg-raised"
            />
          </div>
        </div>
      </section>

      {/* Who is behind this
          Moved up to sit directly under the hero, before any other claim: the
          visitor should know who they're trusting with their documents before
          reading anything else the page argues. */}
      {FOUNDER.name.trim() && FOUNDER.intro[lang]?.trim() && (
        <section className="py-14 px-6 border-t border-hairline">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 mb-4">{T.founderTitle}</p>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">&ldquo;{FOUNDER.intro[lang]}&rdquo;</p>
            <p className="font-semibold text-gray-900">{FOUNDER.name}</p>
            <p className="text-sm text-gray-500">{FOUNDER.role[lang]}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 font-medium">
                <Mail className="h-4 w-4" />{SUPPORT_EMAIL}
              </a>
              <a
                href={whatsappUrl(lang === "en" ? "Hi, I'd like to ask about IntelliBase AI." : "Halo, saya ingin bertanya soal IntelliBase AI.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 font-medium"
              >
                <MessageSquare className="h-4 w-4" />WhatsApp
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Industries */}
      {/* Sits directly under the hero, so it qualifies the pitch ("…and yes,
          that includes your clinical pathways") before the visitor decides
          whether the demo video is worth their time. No top padding on purpose:
          it reads as a closing line of the hero, so the hero's own py-24 is the
          gap it wants.

          Two tiers, not one row of equals. The featured vertical gets a card
          with a headline, three situations, and a link into its own page; the
          rest keep the original short cards below it. The hero above stays
          industry-neutral on purpose — the product genuinely fits any document
          set, and a hospital-only hero would turn away the other four before
          they ever reach this band. */}
      {/* Dropped entirely for an individual, not rewritten. Every card in this
          band names an organisation's document set — clinical pathways, HR
          regulations, branch manuals — and the featured card leads to a page
          written for a hospital's quality team. There is an interesting version
          of this for individuals (doctors, students, consultants) but it is a
          different band with different copy, and inventing it here would put
          professions on the page we have no basis for naming yet. */}
      {!isIndividual && (
      <section className="pb-10 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Rendered from the registry rather than hardcoded, so the day another
              vertical earns the spot this band follows it.
              On the raised surface with a hairline border rather than a tinted
              gradient: this card is the most-clicked thing on the page and does
              not need colour to be found. Lifting it off the paper is enough,
              and it stops competing with the hero directly above. */}
          {FEATURED_INDUSTRY?.featured && FEATURED_INDUSTRY.href && (
            <div className="rounded-2xl border border-hairline bg-raised p-7 md:p-9 mb-10 shadow-sm">
              <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 mb-3">
                    {FEATURED_INDUSTRY.featured.eyebrow[lang]}
                  </p>
                  <h2 className="text-2xl md:text-[1.75rem] font-semibold tracking-[-0.015em] text-gray-900 leading-[1.2] mb-4">
                    {FEATURED_INDUSTRY.featured.headline[lang]}
                  </h2>
                  <p className="text-base text-gray-600 leading-relaxed mb-6">
                    {FEATURED_INDUSTRY.featured.body[lang]}
                  </p>
                  <Link href={FEATURED_INDUSTRY.href}>
                    <Button className="bg-teal-700 hover:bg-teal-800 gap-2 h-11 px-6">
                      {FEATURED_INDUSTRY.featured.cta[lang]} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <ul className="space-y-3.5">
                  {FEATURED_INDUSTRY.featured.points[lang].map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <span className="rounded-full bg-teal-700/10 p-1 mt-0.5 shrink-0">
                        <Check className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                      </span>
                      <span className="text-[0.95rem] text-gray-700 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Left-aligned, not centred, and a step quieter than the card above:
              this row is the footnote to the featured vertical, and centring it
              gave it the same ceremony as a section of its own. */}
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-gray-900 mb-1.5">{T.industriesTitle}</h2>
            <p className="text-sm text-gray-500 max-w-2xl">{T.industriesDesc}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {OTHER_INDUSTRIES.map((ind) => {
              const body = (
                <>
                  <p className="font-medium text-[0.95rem] text-gray-900 mb-1">
                    {ind.name[lang]}
                    {ind.href && <ArrowRight className="h-3.5 w-3.5 inline-block ml-1 -mt-0.5 text-teal-700" />}
                  </p>
                  <p className="text-[0.8rem] text-gray-500 leading-relaxed">{ind.docs[lang]}</p>
                </>
              );
              // An industry with a page of its own is the only one that reads as
              // clickable — it carries the arrow above and lifts on hover. The
              // rest are flat, so nothing invites a click that goes nowhere.
              return ind.href ? (
                <Link
                  key={ind.key}
                  href={ind.href}
                  className="rounded-xl border border-hairline bg-raised p-4 block hover:border-teal-300 hover:shadow-sm transition-all"
                  aria-label={`${ind.name[lang]} — ${T.industriesMore}`}
                >
                  {body}
                </Link>
              ) : (
                <div key={ind.key} className="rounded-xl border border-hairline p-4">{body}</div>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* Problem
          The page went straight from the hero's promise into the industries
          band and the product demo — nothing named the visitor's actual pain
          first. Three flat cards, not an icon-heavy section: the point is to
          be recognised in a few seconds, not to compete with the hero above
          or the proof below it. */}
      <section className="pb-10 px-6">
        <div className="max-w-4xl mx-auto text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{T.problemTitle}</h2>
          <p className="text-gray-500">{T.problemDesc}</p>
        </div>
        <div className="max-w-4xl mx-auto grid gap-4 sm:grid-cols-3">
          {T.problemPoints.map((p) => (
            <div key={p} className="rounded-xl border border-hairline bg-raised p-5">
              <p className="text-sm text-gray-700 leading-relaxed">{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo video */}
      <DemoVideo title={T.videoTitle} desc={T.videoDesc} playLabel={T.videoPlay} />

      {/* Stats */}
      <section className="bg-teal-700 py-11 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {T.stats.map((s) => (
              // aria-describedby, not a bare "*": it points a screen reader at
              // the footnote instead of announcing a star with no explanation.
              // The asterisk alone wasn't doing its job — at the same size and
              // weight as the hard facts next to it, an estimate like "< 3 detik"
              // still read as a headline number. One size and weight down keeps
              // it legible but visibly secondary to what's actually measured.
              <div key={s.l} className="text-center" aria-describedby={s.estimate ? STATS_NOTE_ID : undefined}>
                <p className={s.estimate ? "text-2xl font-semibold text-white/90 mb-1" : "text-3xl font-bold text-white mb-1"}>{s.v}</p>
                <p className="text-teal-100 text-sm">
                  {s.l}
                  {s.estimate && <sup aria-hidden="true"> *</sup>}
                </p>
              </div>
            ))}
          </div>
          {/* teal-100 rather than a dimmed teal-200: at text-xs on teal-700 the
              dimmed version sits at ~3.4:1, so the one line on the page whose
              whole job is to be read honestly was the hardest to read. */}
          <p id={STATS_NOTE_ID} className="text-teal-100 text-xs text-center mt-8">{ESTIMATE_NOTE[lang]}</p>
        </div>
      </section>

      {/* How it works */}
      {/* Wider than the rest of the page on purpose: this is the only section
          that has to make a screenshot legible, and the width is what does it.
          A 1864px-wide dashboard reads at about 69% here, against 25% when it
          was sharing a row with the copy. */}
      <section className="py-14 px-6 bg-sunken">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-9">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{T.howTitle}</h2>
            <p className="text-gray-500">{T.howDesc}</p>
          </div>
          <div className="space-y-16 md:space-y-24">
            {T.steps.map((s) => {
              const shot = STEP_SHOTS[s.shot];
              return (
                <div key={s.n}>
                  <div className="max-w-2xl mx-auto text-center mb-8">
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <div className="h-8 w-8 rounded-full bg-teal-600 text-white text-sm font-bold flex items-center justify-center shrink-0">{s.n}</div>
                      <div className="p-2 bg-teal-50 rounded-lg"><s.icon className="h-5 w-5 text-teal-600" /></div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{s.t}</h3>
                    <p className="text-gray-500 leading-relaxed">{s.d}</p>
                  </div>
                  <Image
                    src={shot}
                    // Decorative: the heading and copy directly above each one
                    // already say what it shows, so alt text would only make a
                    // screen reader repeat itself.
                    alt=""
                    // Never scale a screenshot past its own pixels — the employee
                    // dialog is only 684px wide, and stretched to the container it
                    // would be a blurry 187%. Capping at the intrinsic width keeps
                    // every shot crisp and centres the narrow one.
                    style={{ maxWidth: shot.width }}
                    sizes={shotSizes(shot.width)}
                    // h-auto keeps each file's own aspect ratio, so the near-square
                    // dialog and the wide dashboard both stay undistorted.
                    className="w-full h-auto mx-auto rounded-xl border border-hairline shadow-sm bg-raised"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* The "Semua yang Dibutuhkan Tim Anda" grid stood here. Every one of its
          six cards repeated a section the visitor had already read: citations
          and the document formats are both spelled out in the three steps above,
          data isolation is the 100% figure in the stats band and a FAQ answer,
          team management is step 2. The only card saying anything new claimed an
          "Audit Log" that is really the chat history — so removing the section
          drops one overstatement along with five repetitions, and takes a full
          screen of scrolling out from between the demo and the price. */}

      {/* ROI Teaser */}
      {/* Hidden for an individual, and this one is about honesty rather than
          relevance. The calculator prices a month of a company's wasted search
          time against its headcount; dragging the slider to 1 does not produce
          a smaller version of that argument, it produces a number we have never
          modelled and would not stand behind. The claim is not "worth less for
          one person" — it is a claim we have not made. */}
      {!isIndividual && (
      <section className="py-14 px-6 bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-7">
            <span className="inline-flex items-center gap-1.5 bg-teal-900/60 text-teal-300 text-xs font-semibold px-3 py-1 rounded-full mb-5">
              <Calculator className="h-3.5 w-3.5" />{T.roiTeaser.badge}
            </span>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-white mb-3">{T.roiTeaser.title}</h2>
            <p className="text-gray-400 max-w-xl mx-auto">{T.roiTeaser.desc}</p>
          </div>
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-300">{T.roiTeaser.label}</label>
                <span className="text-2xl font-bold text-white">{teaserEmployees} <span className="text-base font-normal text-gray-400">{T.roiTeaser.unit}</span></span>
              </div>
              <input
                type="range" min={5} max={500} step={5}
                value={teaserEmployees}
                onChange={(e) => setTeaserEmployees(Number(e.target.value))}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-teal-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1"><span>5</span><span>500</span></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-5 text-center">
                <p className="text-red-400 text-xs font-medium mb-2">{T.roiTeaser.lostLabel}</p>
                <p className="text-3xl font-bold text-red-400">{formatRp(teaser.costLost)}</p>
              </div>
              <div className="bg-green-900/30 border border-green-800/50 rounded-xl p-5 text-center">
                <p className="text-green-400 text-xs font-medium mb-2">{T.roiTeaser.savingLabel}</p>
                <p className="text-3xl font-bold text-green-400">{formatRp(teaser.savingsWithAI)}</p>
              </div>
            </div>
            <div className="text-center">
              <Link href="/roi">
                <Button size="lg" className="bg-teal-600 hover:bg-teal-500 gap-2 h-12 px-10 font-semibold">
                  {T.roiTeaser.cta} <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <p className="text-gray-500 text-xs mt-3">{T.roiTeaser.ctaNote}</p>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Pricing teaser */}
      <section className="py-14 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{T.priceTitle}</h2>
          <p className="text-gray-500 mb-8">{T.priceDesc}</p>
          {/* Two cards for an individual, four for a company. Left at four
              columns the two would stretch to a quarter of the row each and sit
              in a line of empty space; the narrower grid keeps them the size of
              cards rather than of gaps. */}
          <div className={`grid gap-4 mb-8 ${isIndividual ? "sm:grid-cols-2 max-w-xl mx-auto" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
            {T.pricePlans.map((p) => {
              // Only the self-serve tiers take their price from the pricing
              // module; Starter is free and Custom has no list price at all, so
              // both keep the literal string from the copy above.
              const planKey = p.name === "Personal" ? "personal" : p.name === "Professional" ? "professional" : p.name === "Enterprise" ? "enterprise" : null;
              const promo = planKey ? isPromoActive() : false;
              const priceText = planKey
                ? `${formatRp(getPlanPrice(planKey))}${lang === "id" ? "/bln" : "/mo"}`
                : p.price;
              return (
                <div key={p.name} className={`rounded-xl border p-5 text-left ${promo ? "border-teal-200 bg-teal-50" : ""}`}>
                  {promo && <span className="text-xs font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full mb-2 inline-block">PROMO</span>}
                  <p className="font-bold text-gray-900">{p.name}</p>
                  <p className="text-teal-600 font-semibold text-sm">{priceText}</p>
                  <p className="text-gray-400 text-xs mt-1">{p.desc}</p>
                </div>
              );
            })}
          </div>
          <Link href={`/pricing${audienceQuery}`}><Button variant="outline" className="gap-2">{T.priceBtn} <ArrowRight className="h-4 w-4" /></Button></Link>
        </div>
      </section>

      {/* FAQ */}
      {/* Placed after pricing and before the final CTA on purpose: these are
          the objections that surface once someone has decided they want it and
          started imagining their own SOPs sitting on someone else's server, so
          they belong between the price and the ask — not earlier, where they
          would plant doubts the visitor did not have yet. */}
      <section className="py-14 px-6 bg-sunken border-t border-hairline">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-7">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{T.faqTitle}</h2>
            <p className="text-gray-500">{T.faqDesc}</p>
          </div>
          {/* Radix unmounts a closed panel, so the answers are not in the DOM
              for a crawler to read. This mirrors them as structured data —
              which is also what makes them eligible to appear directly in
              search results, where the objection gets answered before the
              visitor even arrives. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: T.faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }).replace(/</g, "\\u003c"),
            }}
          />
          <Accordion type="single" collapsible className="bg-raised rounded-2xl border border-hairline px-6">
            {T.faq.map((f, i) => (
              // Keyed by position, not by the question text: `value` is the
              // item's identity to Radix, and two entries that happen to share
              // wording — easy to introduce while editing copy, and invisible
              // when it happens — would open and close as one. The list is
              // static and never reordered at runtime, and an index cannot
              // collide or drift between the two translations the way a
              // hand-written id in both arrays would.
              //
              // The audience is part of that identity because the two FAQs are
              // different lists that happen to be the same length. Radix keeps
              // its open item in uncontrolled state and this accordion never
              // unmounts, so a plain index left "faq-5" open across a tab switch
              // — the panel stayed down, now showing a question nobody clicked.
              <AccordionItem key={`${audience}-${i}`} value={`faq-${audience}-${i}`} className="last:border-b-0">
                <AccordionTrigger className="text-left text-base font-semibold text-gray-900 hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-gray-600 leading-relaxed pr-6">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">
              {T.faqMore}{" "}
              <a href={consultationMailto(lang)} className="text-teal-700 hover:text-teal-800 font-medium underline underline-offset-4 decoration-teal-300">
                {T.faqMoreCta}
              </a>{" "}
              {/* Plain text, deliberately not a second link: same reason as the
                  final CTA — the address has to be readable when the mailto
                  does nothing. */}
              <span className="text-gray-400">— {SUPPORT_EMAIL}</span>
            </p>
            <Link href="/privacy" className="inline-block text-xs text-gray-400 hover:text-gray-600 mt-3 underline underline-offset-4">
              {T.privacyLink}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-700 to-[#061C24] py-16 px-6 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">{T.ctaTitle}</h2>
        <p className="text-teal-100 text-lg mb-8">{T.ctaDesc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href={`/register${audienceQuery}`}><Button size="lg" className="bg-white text-teal-600 hover:bg-teal-50 gap-2 font-semibold h-12 px-8">{T.ctaBtn1} <ArrowRight className="h-5 w-5" /></Button></Link>
          {/* Was a second "view pricing" button, sitting one section below the
              pricing teaser and a scroll below the pricing link in the nav. The
              page's last word is better spent on the visitor who has read
              everything and still wants to talk to a person first. */}
          {/* asChild so the anchor *is* the button: wrapping a <button> in an
              <a> nests interactive content, which gives keyboard and screen
              reader users two stops for one action. */}
          <Button asChild size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8 gap-2">
            <a href={consultationMailto(lang)}>
              <Mail className="h-4 w-4" />{T.ctaBtn2}
            </a>
          </Button>
        </div>
        {/* The address in plain text, not only behind the mailto: a browser
            with no mail handler registered does nothing at all when that link
            is clicked — no error, no window. Reading the address is the
            fallback for a click that silently goes nowhere. */}
        <p className="text-teal-200/80 text-xs mt-5">
          {T.consultNote} ·{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4 hover:text-white">{SUPPORT_EMAIL}</a>
        </p>

        {/* A second, lower-friction exit next to the mailto above: no mail
            client to switch to, and — unlike the mailto — a record on our
            side to follow up on. Kept to one field on purpose; audience and
            language are already known from page state, so the form asks for
            nothing the visitor would have to think about. */}
        <form onSubmit={submitLead} className="max-w-sm mx-auto mt-8 flex flex-col items-center gap-2">
          {leadStatus === "done" ? (
            <p className="text-white text-sm font-medium">{T.leadSuccess}</p>
          ) : (
            <>
              <p className="text-teal-100 text-xs">{T.leadLabel}</p>
              <div className="flex w-full gap-2">
                {/* aria-label, not the <p> above: that paragraph is not tied to
                    this input by anything, and a placeholder is not a name — a
                    screen reader would announce this field as unlabelled. */}
                <input
                  type="email"
                  required
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder={T.leadPlaceholder}
                  aria-label={T.leadLabel}
                  className="flex-1 h-10 rounded-md border border-white/30 bg-white/10 px-3 text-sm text-white placeholder:text-teal-200/60 focus:outline-none focus:border-white/60"
                />
                {/* Honeypot, and deliberately the *last* field rather than the
                    first. Password managers fill by position and heuristic as
                    much as by name, and a bare text input sitting ahead of the
                    email box is what "username" looks like to one — which would
                    trip the trap on a real person and drop their address while
                    still telling them it went through. No name or id either,
                    for the same reason: nothing here for a matcher to grab.

                    Off-screen rather than display:none, because some bots skip
                    what that hides while still filling this. */}
                <input
                  type="text"
                  value={leadWebsite}
                  onChange={(e) => setLeadWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-0 w-0"
                />
                <Button
                  type="submit"
                  disabled={leadStatus === "loading"}
                  className="bg-white text-teal-700 hover:bg-teal-50 h-10 px-4 shrink-0"
                >
                  {T.leadBtn}
                </Button>
              </div>
              {leadStatus === "error" && <p className="text-teal-100 text-xs">{T.leadError}</p>}
            </>
          )}
        </form>
      </section>

      {/* Footer
          Hand-written here instead of using <SiteFooter>, which every other
          marketing page renders. The two have drifted — this one carries the
          support address, that one carries the version string — so they are not
          interchangeable today.

          Worth knowing before adding a link anywhere: a link added to
          SiteFooter does NOT appear on this page, and this is the page most
          visitors see. That is exactly how the blog shipped reachable from
          /pricing and /privacy but not from the landing page. Any new
          site-wide link has to be added in both places until these are
          unified. */}
      <footer className="border-t py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <LogoFull size="sm" />
          <p className="text-gray-400 text-sm">© 2026 IntelliBase AI. All rights reserved.</p>
          {/* The support address was reachable only through the floating
              button, which a visitor has to notice and open. A vendor asking
              for a company's internal documents should state a way to reach it
              in plain text on the page. */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-600">{T.footer.contact}: {SUPPORT_EMAIL}</a>
            {/* Repeated from SiteFooter rather than shared with it: this page
                carries its own footer, which is why the blog link added to
                SiteFooter reached every marketing page except the one that
                matters most. See the note above <footer>. */}
            <Link href="/blog" className="hover:text-gray-600">{T.footer.blog}</Link>
            {!isIndividual && <Link href="/roi" className="hover:text-gray-600">{T.footer.roi}</Link>}
            <Link href={`/pricing${audienceQuery}`} className="hover:text-gray-600">{T.footer.price}</Link>
            <Link href="/login" className="hover:text-gray-600">{T.footer.login}</Link>
            <Link href={`/register${audienceQuery}`} className="hover:text-gray-600">{T.footer.register}</Link>
            <Link href="/terms" className="hover:text-gray-600">{T.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-gray-600">{T.footer.privacy}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
