"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { getPlanPrice, PLAN_LABELS, type PurchasablePlan } from "@/lib/pricing";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { ROI_DEFAULTS, calculateRoi, ESTIMATE_NOTE, RECOVERED_SHARE_LABEL } from "@/lib/roi";
import { OTHER_INDUSTRIES } from "@/lib/industries";
import { SUPPORT_EMAIL, FOUNDER } from "@/lib/contact";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ArrowRight, Users, FileText, MessageSquare } from "lucide-react";
import { AnimatedMarqueeHero } from "@/components/ui/hero-3";
import { DemoChat } from "@/components/DemoChat";
import { CtaGroup } from "@/components/CtaGroup";
import { demoWhatsappUrl } from "@/lib/cta";
import { trackCta } from "@/lib/cta-analytics";

const STA = PLAN_LIMITS.starter;
const PRO = PLAN_LIMITS.professional;
const ENT = PLAN_LIMITS.enterprise;

// A card in the homepage price teaser. `planKey` is what decides whether the
// price is read from the pricing module (and so can never disagree with the
// checkout) or taken from the `price` string — the tiers with no list price.
type PricePlan = {
  planKey: PurchasablePlan | null;
  name: string;
  price: string;
  desc: string;
  pilot?: boolean;
};

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
// Taken from a real individual account. They no longer back a step of their
// own (the homepage dropped its Individu tab when it was repositioned around
// hospitals), but they still show more of the real product in the hero marquee.
import personalUploadShot from "../../public/screenshots/personal-upload.png";
import personalAskShot from "../../public/screenshots/personal-ask.png";
import personalPersonaShot from "../../public/screenshots/personal-persona.png";

const STEP_SHOTS = {
  upload: uploadDocumentsShot,
  invite: inviteEmployeesShot,
  ask: askAndAnswerShot,
};

// The hero marquee runs on the same product screenshots, not stock photography.
// Two reasons, and the first one is not aesthetic: `img-src` in next.config.ts
// is 'self' plus the payment/analytics/Drive hosts, so an Unsplash URL here
// renders as a broken box in production and nowhere else. The second is that a
// band of generic office photos under "your employees can know every company
// policy" is exactly the stock-image filler this page spent PR #38 removing.
//
// `.src` rather than the imported object because these are laid out with
// `fill` — the intrinsic dimensions are unused — while the import itself still
// means a deleted or renamed screenshot breaks the build.

const HERO_MARQUEE_SHOTS = [
  askAndAnswerShot,
  uploadDocumentsShot,
  personalAskShot,
  inviteEmployeesShot,
  personalUploadShot,
  personalPersonaShot,
].map((shot) => shot.src);

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

// The email capture, extracted from the closing CTA when it moved to the footer.
// Its own component so its four pieces of state live where they are used rather
// than in the page component, which was holding them only because the markup
// happened to sit there.
//
// Behaviour is unchanged: same endpoint, same audience/locale payload, same
// honeypot, same in-flight ref, same 10s timeout with the same feature test.
// Only the colours moved with it, from white-on-teal to the light footer.
function LeadForm() {
  const { lang } = useLang();
  const T = CONTENT[lang];
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  // A ref, not the status above, because the guard has to hold *within* a tick.
  // Two submits fired before React re-renders (Enter pressed twice) both read
  // the same "idle" from the closure and both POST — two rows for one person,
  // and the disabled button never gets a chance to intervene.
  const inFlight = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || status === "done") return;
    inFlight.current = true;
    setStatus("loading");

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
        body: JSON.stringify({ email, audience: "company", locale: lang, website }),
        signal: timeout,
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }

  if (status === "done") {
    return <p className="text-sm font-medium text-teal-800">{T.leadSuccess}</p>;
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col items-center gap-2">
      <p className="text-xs text-stone-500">{T.leadLabel}</p>
      <div className="flex w-full gap-2">
        {/* aria-label, not the <p> above: that paragraph is not tied to this
            input by anything, and a placeholder is not a name — a screen reader
            would announce this field as unlabelled. */}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={T.leadPlaceholder}
          aria-label={T.leadLabel}
          className="h-10 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none"
        />
        {/* Honeypot, and deliberately the *last* field rather than the first.
            Password managers fill by position and heuristic as much as by name,
            and a bare text input sitting ahead of the email box is what
            "username" looks like to one — which would trip the trap on a real
            person and drop their address while still telling them it went
            through. No name or id either, for the same reason: nothing here for
            a matcher to grab.

            Off-screen rather than display:none, because some bots skip what that
            hides while still filling this. */}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0"
        />
        <Button type="submit" disabled={status === "loading"} className="h-10 shrink-0 px-4">
          {T.leadBtn}
        </Button>
      </div>
      {status === "error" && <p className="text-xs text-stone-500">{T.leadError}</p>}
    </form>
  );
}

const CONTENT = {
  id: {
    // Headline, chosen from three drafts. The two that lost:
    //   "SPO, PPK, dan Clinical Pathway RS Anda, Dijawab AI dalam 3 Detik"
    //     The response time has never been measured (the stats band below
    //     stars it as an estimate), and a headline cannot carry a footnote.
    //   "Jam 3 Pagi, Staf Jaga Tetap Tahu SPO yang Berlaku"
    //     A strong hook, but it names a moment instead of the visitor's own
    //     documents, and the paragraph underneath already opens on that 3 a.m.
    // The winner names the three documents a hospital quality team owns, and
    // "kapan saja" carries the 24-hour point without a number we cannot back.
    badge: "Dibangun oleh dokter, untuk rumah sakit & klinik",
    hero1: "SPO, PPK, dan Clinical Pathway Rumah Sakit Anda,",
    hero2: "Bisa Ditanya",
    hero3: "Kapan Saja",
    heroDesc: "Pertanyaan prosedur jam 3 pagi, revisi SPO yang kalah cepat dari fotokopi lama di dinding ruangan, perawat orientasi yang menanyakan hal yang sama berulang kali. Asisten AI menjawab dari dokumen resmi rumah sakit Anda sendiri, lengkap dengan dokumen sumbernya.",
    stats: [
      // Not the per-question reduction — that number is far bigger and far less
      // honest. This is the share of a month's search cost still standing after
      // all three of the calculator's discounts.
      { v: RECOVERED_SHARE_LABEL, l: "Estimasi biaya waktu pencarian yang bisa dipulihkan", estimate: true },
      { v: "< 3 detik", l: "Rata-rata waktu respons AI", estimate: true },
      { v: "100%", l: "Isolasi data antar perusahaan" },
      { v: "10 menit", l: "Waktu setup hingga siap pakai" },
    ] satisfies Stat[],
    problemTitle: "Masalahnya Bukan Staf Anda",
    problemDesc: "Ini yang biasanya terjadi di rumah sakit setiap hari, sebelum ada satu tempat untuk bertanya.",
    problemPoints: [
      "Perawat dan dokter jaga shift malam harus menunggu pagi atau menelepon senior untuk memastikan SPO yang berlaku, karena bagian mutu tidak bisa dihubungi jam segitu.",
      "Komite mutu sudah menerbitkan revisi SPO dan PPK, tapi yang dibaca di ruangan masih fotokopi lama. Menjelang survei akreditasi, tidak ada yang yakin versi mana yang terbaru.",
      "Perawat orientasi dan staf rotasi menanyakan hal yang sama ke orang yang sama: alur pelaporan insiden, restriksi formularium, prosedur rujukan.",
    ],
    problemMore: "Lihat jenis dokumen dan contoh pertanyaan di rumah sakit",
    // "Cocok untuk", not "dipakai oleh": there are no customers in these
    // industries to point at yet. The industry names come from OTHER_INDUSTRIES.
    industryRowLead: "Bukan rumah sakit? IntelliBase juga cocok untuk",
    industryRowMore: "Lihat industri lain",
    howTitle: "Cara Kerja IntelliBase",
    howDesc: "Setup dalam 10 menit, langsung bisa dipakai seluruh unit",
    // Examples stay on policy and procedure (incident reporting, formulary
    // restrictions), never dosing or diagnosis: the product is document search,
    // not clinical decision support, and /solusi/rumah-sakit says so explicitly.
    steps: [
      { n: "1", shot: "upload", t: "Upload Dokumen", d: "Bagian mutu mengunggah SPO, PPK, clinical pathway, formularium, dan dokumen akreditasi dalam format PDF, DOCX, Excel, atau PowerPoint. AI langsung mengindeks.", icon: FileText },
      { n: "2", shot: "invite", t: "Undang Staf", d: "Tambahkan akun perawat, dokter jaga, dan staf unit dari dashboard, lalu atur dokumen mana yang bisa dibuka tiap unit. Mereka bisa langsung login dan mulai bertanya.", icon: Users },
      { n: "3", shot: "ask", t: "Tanya & Dapat Jawaban", d: "Perawat jaga mengetik, misalnya, “Bagaimana alur pelaporan insiden keselamatan pasien?” AI menjawab dari dokumen resmi rumah sakit, lengkap dengan daftar dokumen sumber yang bisa dibuka untuk mengecek.", icon: MessageSquare },
    ] satisfies Step[],
    priceTitle: "Harga yang Transparan",
    priceDesc: "Mulai gratis, upgrade ketika tim Anda berkembang. Tidak ada biaya tersembunyi.",
    pricePlans: [
      { planKey: null, name: PLAN_LABELS.starter, price: "Gratis", desc: `${STA.maxEmployees} karyawan · ${STA.maxDocuments} dokumen` },
      { planKey: "professional", name: PLAN_LABELS.professional, price: "", desc: `${PRO.maxEmployees} pengguna · ${PRO.maxDocuments} dokumen`, pilot: true },
      // TODO: MINOR — `price: ""` adalah sentinel diam. Kalau planKey suatu saat
      // jadi null, kartunya me-render harga kosong tanpa error. Jadikan mustahil
      // lewat discriminated union, atau isi dengan "-" sebagai fallback terlihat.
      { planKey: "enterprise", name: PLAN_LABELS.enterprise, price: "", desc: `${ENT.maxEmployees} pengguna · ${ENT.maxDocuments} dokumen`, pilot: true },
      { planKey: null, name: PLAN_LABELS.custom, price: "Hubungi kami", desc: "Grup RS, multi-cabang, industri lain" },
    ] satisfies PricePlan[],
    priceBtn: "Lihat Detail Harga",
    pricePilotBadge: "PILOT 7 HARI",
    // Every answer here is checked against what the product actually does and
    // against /privacy — this is the section a cautious buyer reads hardest, so
    // a claim that overshoots costs more here than anywhere else on the page.
    faqTitle: "Pertanyaan yang Biasanya Muncul Duluan",
    faqDesc: "Sebelum mengunggah dokumen internal, ini biasanya yang ingin dipastikan lebih dulu.",
    faq: [
      {
        q: "Dokumen internal kami disimpan di mana, dan siapa yang bisa membukanya?",
        a: "Dokumen disimpan di database PostgreSQL (Neon) dengan seluruh koneksi terenkripsi TLS. Setiap perusahaan punya ruang datanya sendiri yang dipisahkan di level database, bukan sekadar difilter di aplikasi. Jadi pertanyaan karyawan Anda tidak pernah bisa menyentuh dokumen perusahaan lain. Di dalam perusahaan Anda sendiri, admin yang menentukan dokumen mana bisa diakses departemen mana.",
      },
      {
        q: "Apakah dokumen kami dipakai untuk melatih AI?",
        a: "IntelliBase tidak melatih model AI apa pun dengan dokumen Anda, dan tidak menjual atau membagikannya ke perusahaan lain. Yang perlu Anda tahu apa adanya: saat dokumen diunggah, isinya dikirim ke Google (Gemini API) untuk diubah menjadi indeks pencarian, dan saat pertanyaan dijawab, potongan teks yang relevan dikirim ke Groq. Groq menyatakan tidak memakai data API pelanggan untuk melatih modelnya. Akun Gemini kami saat ini masih di tier gratis, dan ketentuan Google untuk tier itu mengizinkan mereka memakai konten untuk meningkatkan layanannya. Kalau kebijakan dokumen perusahaan Anda tidak mengizinkan hal tersebut, hubungi kami sebelum mengunggah. Pemrosesan bisa dipindahkan ke tier berbayar yang tidak memakai konten pelanggan. Rincian lengkapnya ada di Kebijakan Privasi.",
      },
      {
        q: "Bagaimana kalau AI-nya mengarang jawaban?",
        a: "Setiap jawaban datang dengan daftar dokumen sumbernya (nama dokumen beserta potongan teks yang dipakai), sehingga jawaban selalu bisa dicek ke dokumen aslinya. Kalau tidak ada dokumen perusahaan yang relevan dengan pertanyaan, AI menyatakan tidak menemukannya, bukan menebak dari pengetahuan umum internet.",
      },
      {
        q: "Kalau kami berhenti berlangganan, dokumen kami hilang?",
        a: "Tidak dihapus. Ada masa tenggang 7 hari setelah masa aktif berakhir, di mana batas paket lama Anda masih berlaku penuh. Setelah itu batas paket Starter yang berlaku, dan dokumen di atas batas itu dibekukan (tersimpan tetapi tidak ikut dicari) sampai Anda memperpanjang. Kalau Anda memang ingin data dihapus, penghapusan akun menghapus seluruh data dalam 30 hari.",
      },
      {
        q: "Siapa yang bisa melihat pertanyaan yang diajukan karyawan?",
        a: "Admin perusahaan Anda bisa melihat pertanyaan-pertanyaan yang masuk lewat menu Analytics. Ini memang dirancang begitu, supaya Anda tahu dokumen mana yang paling sering dicari dan mana yang ternyata belum ada. Kami sarankan menyampaikan hal ini ke karyawan sejak awal.",
      },
      {
        q: "Format dokumen apa saja yang didukung, dan berapa lama setupnya?",
        a: "PDF, DOCX, Excel, dan PowerPoint. Dokumen diindeks otomatis begitu diunggah, tanpa tagging manual, dan sebagian besar perusahaan sudah bisa mulai bertanya dalam waktu sekitar 10 menit sejak akun dibuat.",
      },
      {
        q: "Bisa dicoba dulu tanpa bayar?",
        a: "Bisa. Paket Starter gratis selamanya untuk 5 karyawan dan 10 dokumen, tanpa kartu kredit. Kalau ingin mencoba dengan dokumen asli perusahaan tapi ragu memulai sendiri, kirim email ke kami dan kami bantu menyiapkannya.",
      },
    ],
    founderTitle: "Siapa di balik IntelliBase",
    // A whole sentence, not half of one. This was written as the lead-in to a
    // "Konsultasi gratis" link; with the link gone it read as a question the
    // page asks and then walks away from — which on a page about answering
    // questions is the worst possible place to leave a loose end. It is not
    // given a link back: the closing section directly below is the answer, and
    // a fourth CTA here is how the sprawl this page was just cleaned of returns.
    faqMore: "Masih ada yang ingin ditanyakan? Jadwalkan demo 15 menit di bawah, dan tanyakan langsung.",
    privacyLink: "Baca Kebijakan Privasi",
    ctaTitle: "Mulai Transformasi Knowledge Base Anda Hari Ini",
    ctaDesc: "Gratis untuk tim kecil. Setup 10 menit. Tidak perlu kartu kredit.",
    // The register button assumes a visitor ready to hand over documents. This
    // is the exit for everyone else — cheaper than signing up, and the only way
    // an unconvinced visitor leaves a trace instead of just leaving.
    consultNote: "Balasan lewat email · Tanpa biaya, tanpa komitmen",
    leadLabel: "Atau tinggalkan email, kami hubungi lebih dulu",
    leadPlaceholder: "email@perusahaan.com",
    leadBtn: "Kirim",
    leadSuccess: "Terima kasih. Kami akan menghubungi Anda.",
    leadError: "Gagal mengirim. Coba lagi sebentar lagi.",
    // Written for the reader the rest of this page is written for. The generic
    // "perusahaan / karyawan / dokumen internal" wording was correct and
    // placeless: it sat between a hospital hero, a demo answering ward
    // questions, and hospital pricing, and read as a block lifted from another
    // product. The arithmetic is untouched — only the nouns change, and the
    // slider still counts headcount, which is what `calculateRoi` consumes.
    roiTeaser: {
      title: "Berapa Kerugian Rumah Sakit Anda Setiap Bulan?",
      desc: "Geser slider untuk melihat estimasi biaya waktu yang terbuang saat perawat dan dokter jaga mencari SPO, PPK, atau clinical pathway.",
      label: "Jumlah staf",
      // Was hardcoded next to the slider value, so the English page counted its
      // headcount in "orang".
      unit: "orang",
      lostLabel: "Nilai waktu pencarian / bulan",
      // "Potensi" invited the reader to imagine the ceiling. This figure is
      // already the floor of our own model — say so, and let the calculator
      // page show the working.
      savingLabel: "Estimasi hemat setelah asumsi konservatif",
      cta: "Hitung Penghematan Lengkap",
      ctaNote: "Gratis, tanpa perlu daftar. Asumsi perhitungannya ditampilkan lengkap.",
    },
    nav: { price: "Harga", login: "Masuk", roi: "Kalkulator ROI", blog: "Blog", demo: "Jadwalkan Demo" },
    footer: { price: "Harga", login: "Masuk", register: "Daftar", terms: "Syarat & Ketentuan", privacy: "Privasi", roi: "Kalkulator ROI", contact: "Kontak", blog: "Blog" },
  },
  en: {
    // English versions of the two rejected drafts, rejected for the same reasons:
    //   "Your Hospital's SOPs and Clinical Pathways, Answered by AI in 3 Seconds"
    //   "At 3 a.m., the Night Shift Still Knows Which SOP Applies"
    badge: "Built by a doctor, for hospitals & clinics",
    hero1: "Your Hospital's SOPs, Practice Guidelines, and Clinical Pathways,",
    hero2: "Answered",
    hero3: "at Any Hour",
    heroDesc: "A procedure question at 3 a.m., an SOP revision that loses to the old photocopy on the ward wall, orientation nurses asking the same thing again and again. The AI answers from your hospital's own official documents and names the source every time.",
    stats: [
      { v: RECOVERED_SHARE_LABEL, l: "Estimated share of search cost recoverable", estimate: true },
      { v: "< 3 sec", l: "Average AI response time", estimate: true },
      { v: "100%", l: "Data isolation between companies" },
      { v: "10 min", l: "Setup time until ready" },
    ] satisfies Stat[],
    problemTitle: "It's Not Your Staff. It's the Search",
    problemDesc: "This is what usually happens in a hospital every day, before there is one place to ask.",
    problemPoints: [
      "Night-shift nurses and on-call doctors wait for morning, or phone a senior, to confirm which SOP applies, because the quality department cannot be reached at that hour.",
      "The quality committee has issued a revised SOP or guideline, but the ward still reads the old photocopy. With an accreditation survey coming, nobody is sure which version is current.",
      "Orientation nurses and rotating staff ask the same people the same things: incident reporting, formulary restrictions, referral procedures.",
    ],
    problemMore: "See hospital document types and example questions",
    industryRowLead: "Not a hospital? IntelliBase also fits",
    industryRowMore: "See other industries",
    howTitle: "How IntelliBase Works",
    howDesc: "Setup in 10 minutes, ready for every unit immediately",
    steps: [
      { n: "1", shot: "upload", t: "Upload Documents", d: "The quality team uploads SOPs, practice guidelines, clinical pathways, the formulary, and accreditation documents in PDF, DOCX, Excel, or PowerPoint format. AI indexes immediately.", icon: FileText },
      { n: "2", shot: "invite", t: "Invite Staff", d: "Add accounts for nurses, on-call doctors, and unit staff from the dashboard, and choose which documents each unit can open. They can log in and start asking right away.", icon: Users },
      { n: "3", shot: "ask", t: "Ask & Get Answers", d: "A duty nurse types, say, “How do I report a patient safety incident?” The AI answers from the hospital's official documents, listing the source documents they can open to check.", icon: MessageSquare },
    ] satisfies Step[],
    priceTitle: "Transparent Pricing",
    priceDesc: "Start free, upgrade as your team grows. No hidden fees.",
    pricePlans: [
      { planKey: null, name: PLAN_LABELS.starter, price: "Free", desc: `${STA.maxEmployees} employees · ${STA.maxDocuments} documents` },
      { planKey: "professional", name: PLAN_LABELS.professional, price: "", desc: `${PRO.maxEmployees} users · ${PRO.maxDocuments} documents`, pilot: true },
      { planKey: "enterprise", name: PLAN_LABELS.enterprise, price: "", desc: `${ENT.maxEmployees} users · ${ENT.maxDocuments} documents`, pilot: true },
      { planKey: null, name: PLAN_LABELS.custom, price: "Contact us", desc: "Hospital groups, multi-site, other industries" },
    ] satisfies PricePlan[],
    priceBtn: "View Full Pricing",
    pricePilotBadge: "7-DAY PILOT",
    faqTitle: "The Questions That Come Up First",
    faqDesc: "Before uploading internal documents, this is usually what people want settled.",
    faq: [
      {
        q: "Where are our internal documents stored, and who can open them?",
        a: "Documents are stored in a PostgreSQL database (Neon), with every connection encrypted over TLS. Each company gets its own data space, separated at the database level rather than merely filtered in the application. Your employees' questions can never reach another company's documents. Within your own company, your admin decides which departments can access which documents.",
      },
      {
        q: "Are our documents used to train the AI?",
        a: "IntelliBase does not train any AI model on your documents, and does not sell or share them with other companies. What you should know plainly: when a document is uploaded, its contents are sent to Google (Gemini API) to be turned into a search index, and when a question is answered, the relevant excerpts are sent to Groq. Groq states that it does not use customer API data to train its models. Our Gemini account is currently on the free tier, and Google's terms for that tier allow them to use content to improve their services. If your company's document policy does not permit that, contact us before uploading. Processing can be moved to a paid tier that does not use customer content. The full detail is in our Privacy Policy.",
      },
      {
        q: "What if the AI makes an answer up?",
        a: "Every answer arrives with its source documents listed (the document name plus the excerpt it used), so any answer can be checked against the original. When no company document is relevant to the question, the AI says it could not find one rather than guessing from general internet knowledge.",
      },
      {
        q: "If we stop subscribing, do we lose our documents?",
        a: "Nothing is deleted. There is a 7-day grace period after expiry during which your previous plan's limits still apply in full. After that the Starter limits apply, and documents above that limit are frozen (still stored, but left out of search) until you renew. If you do want your data gone, deleting your account removes everything within 30 days.",
      },
      {
        q: "Who can see the questions employees ask?",
        a: "Your company's admin can see the questions that come in, via the Analytics tab. That is by design, so you can see which documents are searched most and which ones turn out to be missing. We recommend telling your employees this up front.",
      },
      {
        q: "Which document formats are supported, and how long is setup?",
        a: "PDF, DOCX, Excel, and PowerPoint. Documents are indexed automatically on upload, with no manual tagging, and most companies are asking their first questions within about 10 minutes of creating an account.",
      },
      {
        q: "Can we try it without paying?",
        a: "Yes. The Starter plan is free forever for 5 employees and 10 documents, no credit card. If you would rather try it with your real documents but do not want to set it up alone, email us and we will help you get started.",
      },
    ],
    founderTitle: "Who is behind IntelliBase",
    faqMore: "Still have a question? Book the 15-minute demo below and ask it directly.",
    privacyLink: "Read the Privacy Policy",
    ctaTitle: "Start Transforming Your Knowledge Base Today",
    ctaDesc: "Free for small teams. 10-minute setup. No credit card required.",
    consultNote: "We reply by email · Free, no commitment",
    leadLabel: "Or leave your email and we'll reach out first",
    leadPlaceholder: "email@company.com",
    leadBtn: "Send",
    leadSuccess: "Thanks. We'll be in touch.",
    leadError: "Something went wrong. Please try again shortly.",
    roiTeaser: {
      title: "How Much Is Your Hospital Losing Every Month?",
      desc: "Drag the slider to see the estimated cost of time lost when nurses and on-call doctors go hunting for an SOP, care pathway, or formulary.",
      label: "Number of staff",
      unit: "people",
      lostLabel: "Value of search time / month",
      savingLabel: "Estimated savings after conservative assumptions",
      cta: "Calculate Full Savings",
      ctaNote: "Free, no sign-up. The assumptions are shown in full.",
    },
    nav: { price: "Pricing", login: "Sign In", roi: "ROI Calculator", blog: "Blog", demo: "Book a Demo" },
    footer: { price: "Pricing", login: "Sign In", register: "Register", terms: "Terms", privacy: "Privacy", roi: "ROI Calculator", contact: "Contact", blog: "Blog" },
  },
};

// "A, B, C, dan D". Written out rather than Intl.ListFormat so the prerendered
// HTML and the hydrated client cannot disagree about locale data.
function joinNames(names: string[], lang: string) {
  if (names.length < 2) return names.join("");
  return names.slice(0, -1).join(", ") + (lang === "id" ? ", dan " : ", and ") + names[names.length - 1];
}

function formatRp(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)} M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} jt`;
  return `Rp ${(v / 1_000).toFixed(0)}rb`;
}

export function LandingContent() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  const [teaserEmployees, setTeaserEmployees] = useState(ROI_DEFAULTS.employees);
  // Same arithmetic and same assumptions as /roi, with headcount as the only
  // input the visitor moves — so the teaser and the calculator it links to
  // cannot quote different numbers for the same company size.
  const teaser = calculateRoi({ ...ROI_DEFAULTS, employees: teaserEmployees });


  return (
    <div className="min-h-[100dvh] bg-background">
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
            <Link href="/blog" className="text-sm text-stone-500 hover:text-stone-800 font-medium hidden md:block">{T.nav.blog}</Link>
            <Link href="/roi" className="text-sm text-stone-500 hover:text-stone-800 font-medium hidden md:block">{T.nav.roi}</Link>
            <Link href="/pricing" className="text-sm text-stone-500 hover:text-stone-800 font-medium hidden md:block">{T.nav.price}</Link>
            {/* One button in the bar, and it is the same ask the rest of the
                page leads with. "Mulai Gratis" used to sit here, which put the
                self-serve signup ahead of the demo in the one place a visitor
                looks first — the opposite of the order the page argues for
                everywhere else. Signup is still reachable: it is the text link
                under every CtaGroup, and it is in the footer. */}
            <Link
              href="/login"
              onClick={() => trackCta("login", "nav")}
              className="hidden sm:inline-flex text-sm text-stone-600 hover:text-stone-900 font-medium"
            >
              {T.nav.login}
            </Link>
            <Button asChild size="sm" className="bg-teal-700 hover:bg-teal-800 active:scale-[0.98] text-xs sm:text-sm px-3 sm:px-4">
              <a
                href={demoWhatsappUrl(lang)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackCta("demo_whatsapp", "nav")}
              >
                {T.nav.demo}
              </a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero
          A centred headline over a scrolling band of product screenshots. The
          two-column hero this replaced showed one screenshot; the marquee shows
          six, which is the cheapest way to answer "is there actually a product
          behind this" before a visitor scrolls. The copy is written for
          hospitals and clinics; the headline drafts sit next to `hero1`.

          Not `h-screen` as the component ships: a nav bar sits above it here, so a full viewport height would push the CTA
          below the fold on a laptop. The bottom padding keeps the centred text
          clear of the marquee band, which is positioned against the section's
          own bottom edge. */}
      <AnimatedMarqueeHero
        className="h-auto min-h-[42rem] pt-10 pb-60 md:min-h-[46rem] md:pb-80"
        tagline={T.badge}
        title={
          <>
            {T.hero1} <span className="text-teal-700">{T.hero2}</span> {T.hero3}
          </>
        }
        description={T.heroDesc}
        // The whole hierarchy, from the one component that owns it. The hero
        // used to carry a "Mulai Gratis" button with a separate consultation
        // mailto beneath it — two different asks, neither of them the demo this
        // page is actually selling, and the mailto led to a client many visitors
        // do not have configured at all.
        cta={<CtaGroup location="hero" />}
        images={HERO_MARQUEE_SHOTS}
        cardAspectClassName="aspect-[16/10]"
      />

      <DemoChat />

      {/* Who is behind this
          Following the interactive demo, the visitor should
          know who they are trusting with their documents before reading
          anything else the page argues. The hero badge says "built by a
          doctor"; this is where that doctor has a name and a voice.

          The portrait slot keeps its size whether or not a photo exists, so
          adding one later does not shift the layout. Until FOUNDER.photo is
          set it shows initials, never a stock face. */}
      {FOUNDER.name.trim() && FOUNDER.intro[lang]?.trim() && (
        <section className="py-14 px-6 border-t border-hairline">
          <div className="max-w-3xl mx-auto flex flex-col items-center gap-8 text-center md:flex-row md:items-start md:gap-12 md:text-left">
            <div className="relative h-28 w-28 md:h-36 md:w-36 shrink-0 overflow-hidden rounded-full border border-hairline bg-sunken">
              {FOUNDER.photo ? (
                <Image src={FOUNDER.photo} alt={FOUNDER.name} fill sizes="(min-width: 768px) 9rem, 7rem" className="object-cover" />
              ) : (
                <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-3xl font-semibold text-teal-700">
                  {FOUNDER.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 mb-4">{T.founderTitle}</p>
              <p className="text-lg text-stone-700 leading-relaxed mb-6">&ldquo;{FOUNDER.intro[lang]}&rdquo;</p>
              <p className="font-semibold text-stone-900">{FOUNDER.name}</p>
              <p className="text-sm text-stone-500">{FOUNDER.role[lang]}</p>
              {/* The email and WhatsApp links that used to sit here are gone.
                  They were a third and fourth way to start the same conversation,
                  offered in the middle of a section whose job is to say who the
                  founder is — not to ask for anything. The address now appears
                  once, in the footer; WhatsApp is the primary CTA everywhere. */}
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
        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-12 md:gap-14 md:items-start">
          <div className="md:col-span-5">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-stone-900 mb-3">{T.problemTitle}</h2>
            <p className="text-stone-500 max-w-[46ch]">{T.problemDesc}</p>
            {/* The full list of hospital document types and real ward questions
                lives on the hospital page. The featured band that used to link
                there is gone now that the whole homepage speaks to hospitals. */}
            <Link href="/solusi/rumah-sakit" className="inline-flex items-center gap-1.5 mt-5 text-sm font-medium text-teal-700 hover:text-teal-800 underline underline-offset-4 decoration-teal-300">
              {T.problemMore} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {/* Hairlines, not three boxes. Three equal cards in a row is the
              single most recognisable AI-built section, and the boxes were
              doing no work here: nothing in them is clickable, nothing needs
              to look raised off the paper, and the row read as a feature grid
              when it is really one list of three complaints. A divided column
              says "list" without spending a border on each item. */}
          <ul className="md:col-span-7 divide-y divide-hairline border-t border-hairline">
            {T.problemPoints.map((p) => (
              <li key={p} className="py-4 text-[0.95rem] text-stone-700 leading-relaxed first:pt-5">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The "Lihat IntelliBase AI Bekerja" video stood here, and it was the
          same promise made twice. It offered to *show* the product working, six
          sections below a demo where the visitor already asked it a question and
          read the answer with the source document attached. A recording cannot
          beat that, and asking someone who has just used the thing to now watch
          a film about it spends the one scroll where their attention is highest.

          Deleted rather than merged: there was nothing in it the live demo does
          not already do better. The video itself still exists on YouTube, so
          bringing it back is a revert, not a reshoot — but its CSP grant
          (youtube-nocookie in frame-src) and the i.ytimg.com remote-image
          pattern went with it, and both have to come back too. */}

      {/* Stats */}
      {/* Was a saturated teal slab. The page's own surface is warm paper, and
          a full-bleed brand-colour band in the middle of it is a theme flip:
          the visitor scrolls out of one site and into another for eleven rems,
          then back. Hairlines between the columns separate the figures just as
          well, and they cost nothing in contrast, which matters because two of
          these four numbers are estimates that have to stay readable while
          reading as secondary. The one dark moment on this page is now the
          closing CTA, and it is dark on purpose. */}
      <section className="py-12 px-6 border-y border-hairline bg-sunken">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 md:divide-x md:divide-hairline">
            {T.stats.map((s) => (
              // aria-describedby, not a bare "*": it points a screen reader at
              // the footnote instead of announcing a star with no explanation.
              // The asterisk alone wasn't doing its job — at the same size and
              // weight as the hard facts next to it, an estimate like "< 3 detik"
              // still read as a headline number. One size and weight down keeps
              // it legible but visibly secondary to what's actually measured.
              <div key={s.l} className="text-center md:px-4" aria-describedby={s.estimate ? STATS_NOTE_ID : undefined}>
                <p className={s.estimate ? "text-2xl font-semibold text-stone-500 mb-1" : "text-3xl font-semibold text-teal-800 mb-1"}>{s.v}</p>
                <p className="text-stone-500 text-sm leading-snug">
                  {s.l}
                  {s.estimate && <sup aria-hidden="true"> *</sup>}
                </p>
              </div>
            ))}
          </div>
          {/* stone-500 rather than a lighter stone-400: the one line on the
              page whose whole job is to be read honestly should not be the
              hardest one to read. On the sunken surface this clears AA. */}
          <p id={STATS_NOTE_ID} className="text-stone-500 text-xs text-center mt-9">{ESTIMATE_NOTE[lang]}</p>
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
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-stone-900 mb-3">{T.howTitle}</h2>
            <p className="text-stone-500">{T.howDesc}</p>
          </div>
          <div className="space-y-16 md:space-y-24">
            {T.steps.map((s) => {
              const shot = STEP_SHOTS[s.shot];
              return (
                <div key={s.n}>
                  <div className="max-w-2xl mx-auto text-center mb-8">
                    {/* The numbered teal circle that used to sit next to this
                        icon is gone. "1 / 2 / 3" above "Upload Dokumen" tells
                        the reader nothing the vertical order has not already
                        told them, and the badge-plus-icon pair is a stock
                        template rhythm. The step's own verb is the label. */}
                    <div className="inline-flex p-2 bg-teal-50 rounded-lg mb-4"><s.icon className="h-5 w-5 text-teal-700" /></div>
                    <h3 className="text-xl font-semibold text-stone-900 mb-2">{s.t}</h3>
                    <p className="text-stone-500 leading-relaxed">{s.d}</p>
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
      {/* Light, on the same warm paper as the rest of the page. This was a
          cool slate-900 slab: not just a second theme, but a second *palette*,
          since every neutral elsewhere here is warm. The red/green result
          tiles were a third and fourth accent on a page whose accent is teal,
          and they carried an implied verdict the numbers already state. Cost
          reads as plain ink, saving reads as the brand colour, and the figures
          are the only large type in the block. */}
      <section className="py-14 px-6 border-t border-hairline">
        <div className="max-w-4xl mx-auto">
          <div className="mb-7 max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-stone-900 mb-3">{T.roiTeaser.title}</h2>
            <p className="text-stone-500">{T.roiTeaser.desc}</p>
          </div>
          <div className="bg-raised rounded-2xl p-7 md:p-8 border border-hairline shadow-sm">
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="roi-teaser-employees" className="text-sm font-medium text-stone-600">{T.roiTeaser.label}</label>
                <span className="text-2xl font-semibold text-stone-900">{teaserEmployees} <span className="text-base font-normal text-stone-500">{T.roiTeaser.unit}</span></span>
              </div>
              {/* htmlFor/id rather than a floating <label>: the label was tied
                  to nothing, so a screen reader announced this slider without
                  saying what it counts. */}
              <input
                id="roi-teaser-employees"
                type="range" min={5} max={500} step={5}
                value={teaserEmployees}
                onChange={(e) => setTeaserEmployees(Number(e.target.value))}
                className="w-full h-2 bg-hairline rounded-lg appearance-none cursor-pointer accent-teal-700"
              />
              <div className="flex justify-between text-xs text-stone-400 mt-1"><span>5</span><span>500</span></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 sm:gap-10 mb-8 sm:divide-x sm:divide-hairline">
              <div>
                <p className="text-stone-500 text-xs font-medium mb-2">{T.roiTeaser.lostLabel}</p>
                <p className="text-3xl font-semibold text-stone-900">{formatRp(teaser.costLost)}</p>
              </div>
              <div className="sm:pl-10">
                <p className="text-stone-500 text-xs font-medium mb-2">{T.roiTeaser.savingLabel}</p>
                <p className="text-3xl font-semibold text-teal-800">{formatRp(teaser.savingsWithAI)}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
              {/* Outlined, not filled. It leads to a tool rather than to a
                  conversation, so it belongs at the secondary weight — filled
                  teal is now reserved for one ask on this page, and having a
                  second one here is how the hierarchy quietly comes apart
                  again. */}
              <Link href="/roi">
                <Button size="lg" variant="outline" className="border-hairline bg-raised text-stone-800 hover:bg-stone-100 hover:text-stone-900 active:scale-[0.98] gap-2 h-12 px-8">
                  {T.roiTeaser.cta} <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <p className="text-stone-500 text-xs max-w-xs">{T.roiTeaser.ctaNote}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-14 px-6">
        {/* Left-aligned, with the link to the full table sitting beside the
            heading instead of centred under the cards. The page had six
            sections in a row shaped "centred heading, centred sub-line, grid
            underneath", which is the rhythm that makes a page read as
            generated rather than composed. */}
        <div className="max-w-5xl mx-auto">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-stone-900 mb-3">{T.priceTitle}</h2>
              <p className="text-stone-500">{T.priceDesc}</p>
            </div>
            {/* Wayfinding, not a call to action: a text link now, so the only
                buttons in this section are the CTA group under the cards. As a
                second outlined button it competed with "Coba Demo Langsung" for
                the same visual weight while asking for something much smaller. */}
            <Link href="/pricing" className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-teal-800 underline underline-offset-4 decoration-teal-300 hover:text-teal-900">
              {T.priceBtn} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-4">
            {T.pricePlans.map((p) => {
              // Only the priced tiers read from the pricing module; Starter is
              // free and Custom has no list price at all, so both keep the
              // literal string from the copy above. Matched on `planKey`, not on
              // the displayed name — the names are product labels now and change
              // with the copy, which would silently leave both paid cards
              // falling through to the `null` branch and printing an empty
              // price.
              const planKey = p.planKey;
              const pilot = p.pilot ?? false;
              const priceText = planKey
                ? `${formatRp(getPlanPrice(planKey))}${lang === "id" ? "/bln" : "/mo"}`
                : p.price;
              return (
                <div key={p.name} className={`rounded-xl border p-5 text-left ${pilot ? "border-teal-200 bg-teal-50/60" : "border-hairline"}`}>
                  {/* Teal, not orange. One accent per page: an orange pill was
                      the only orange on the whole site, and a badge here is not
                      the thing worth introducing a second brand colour for. */}
                  {pilot && <span className="text-[0.7rem] font-semibold tracking-wide text-teal-800 bg-teal-700/10 px-2 py-0.5 rounded-full mb-2 inline-block">{T.pricePilotBadge}</span>}
                  <p className="font-semibold text-stone-900">{p.name}</p>
                  <p className="text-teal-800 font-semibold text-sm">{priceText}</p>
                  <p className="text-stone-500 text-xs mt-1">{p.desc}</p>
                </div>
              );
            })}
          </div>
          {/* The second of the three placements. A price table is where a
              visitor either decides or leaves, and the thing to offer at that
              moment is the same conversation the hero offered — not a fourth
              variation of it. */}
          <CtaGroup location="pricing" />
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
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-stone-900 mb-3">{T.faqTitle}</h2>
            <p className="text-stone-500">{T.faqDesc}</p>
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
              <AccordionItem key={i} value={`faq-${i}`} className="last:border-b-0">
                <AccordionTrigger className="text-left text-base font-semibold text-stone-900 hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-stone-600 leading-relaxed pr-6">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="text-center mt-8">
            {/* The mailto link and the repeated address are gone, and the line
                that led into them is now a complete sentence that points at the
                closing section instead of trailing off where the link used to
                be. Copy, not a CTA — see the note on `faqMore`. */}
            <p className="text-sm text-stone-500">{T.faqMore}</p>
            <Link href="/privacy" className="inline-block text-xs text-stone-400 hover:text-stone-600 mt-3 underline underline-offset-4">
              {T.privacyLink}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      {/* The page's one dark moment, and now the only one: a flat deep teal
          rather than a left-to-right gradient into near-black. The gradient
          was decoration, and it made the two buttons sit on two different
          backgrounds, which is how a white button ends up at a different
          contrast ratio depending on the viewport width. */}
      <section className="bg-teal-900 py-16 px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.015em] text-white mb-4">{T.ctaTitle}</h2>
        <p className="text-teal-100 text-lg mb-8">{T.ctaDesc}</p>
        {/* The third and last placement. What stood here was a "Mulai Gratis"
            button, a consultation mailto button, the address in plain text
            beneath it, and an email capture form — four asks stacked in the
            section meant to close. The form has moved to the footer, where it is
            the one secondary option; the address appears there too, once. */}
        <CtaGroup location="closing" tone="dark" />
        {/* Objection handling, not button text, and removing it with the buttons
            was a mistake: "tanpa komitmen" is the exact worry a hospital has
            about the words "jadwalkan demo", and after the first pass that
            phrase appeared nowhere on the page. */}
        <p className="text-teal-100/90 text-xs mt-5">{T.consultNote}</p>
      </section>

      {/* Other industries
          One line, not a section: the homepage is written for hospitals, and
          this is only the door for a visitor who is not one. The names come
          from the registry, so this sentence and /industri cannot disagree. */}
      <section className="px-6 py-8">
        <p className="max-w-6xl mx-auto text-center text-sm text-stone-500">
          {T.industryRowLead} {joinNames(OTHER_INDUSTRIES.map((i) => i.name[lang]), lang)}.{" "}
          <Link href="/industri" className="font-medium text-teal-700 hover:text-teal-800 underline underline-offset-4 decoration-teal-300">{T.industryRowMore}</Link>
        </p>
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
        {/* The email capture, moved down from the closing CTA and kept as the
            one secondary option on the page. Same handler, same honeypot, same
            endpoint — only its position changed. Here it competes with nothing:
            a visitor who reaches the footer has already passed three CTA groups
            without pressing one, so "leave your address instead" is the right
            thing to offer, and the wrong thing to have offered beside the ask
            itself. */}
        <div className="max-w-6xl mx-auto mb-8 border-b border-hairline pb-8 text-center">
          <LeadForm />
        </div>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <LogoFull size="sm" />
          <p className="text-stone-400 text-sm">© 2026 IntelliBase AI. All rights reserved.</p>
          {/* The support address was reachable only through the floating
              button, which a visitor has to notice and open. A vendor asking
              for a company's internal documents should state a way to reach it
              in plain text on the page. */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-stone-400">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-stone-600">{T.footer.contact}: {SUPPORT_EMAIL}</a>
            {/* Repeated from SiteFooter rather than shared with it: this page
                carries its own footer, which is why the blog link added to
                SiteFooter reached every marketing page except the one that
                matters most. See the note above <footer>. */}
            <Link href="/blog" className="hover:text-stone-600">{T.footer.blog}</Link>
            <Link href="/roi" className="hover:text-stone-600">{T.footer.roi}</Link>
            <Link href="/pricing" className="hover:text-stone-600">{T.footer.price}</Link>
            <Link href="/login" className="hover:text-stone-600">{T.footer.login}</Link>
            <Link href="/register" className="hover:text-stone-600">{T.footer.register}</Link>
            <Link href="/terms" className="hover:text-stone-600">{T.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-stone-600">{T.footer.privacy}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
