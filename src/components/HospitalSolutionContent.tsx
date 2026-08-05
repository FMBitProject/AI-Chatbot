"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/lib/language-context";
import { FOUNDER } from "@/lib/contact";
import {
  ArrowRight, Activity, ClipboardList, Stethoscope, HeartPulse, BadgeCheck, Pill,
  ShieldCheck, ScrollText, MessageSquare, Moon, RefreshCw, Info,
} from "lucide-react";

// Everything on this page has to be answerable with "because their own uploaded
// document says so". No claim about accreditation status, no named hospital, no
// figure we have not measured — the landing page was already cleaned of unbacked
// claims once, and a vertical page aimed at clinical staff is the worst possible
// place to reintroduce them.
const CONTENT = {
  id: {
    nav: { price: "Harga", login: "Masuk", start: "Mulai Gratis", roi: "Kalkulator ROI" },
    badge: "🏥 Untuk Rumah Sakit & Klinik",
    title1: "Clinical Pathway dan SPO,",
    title2: "Terjawab dalam Hitungan Detik",
    desc: "Perawat shift malam, dokter jaga, dan staf baru tidak perlu lagi membongkar binder atau menyisir folder share drive. Mereka bertanya seperti bertanya ke senior — jawabannya diambil dari dokumen resmi rumah sakit Anda sendiri.",
    cta1: "Mulai Gratis Sekarang",
    cta2: "Lihat Paket Harga",
    ctaNote: "Gratis selamanya untuk tim kecil · Tidak perlu kartu kredit",

    docsTitle: "Dokumen yang Bisa Anda Unggah",
    docsDesc: "Format PDF, DOCX, Excel, dan PowerPoint — persis seperti file yang sudah ada di komputer bagian mutu Anda.",
    docs: [
      { icon: Activity, t: "Clinical Pathway", d: "Alur tatalaksana per diagnosis, lengkap dengan target length of stay dan kriteria pulang." },
      { icon: ClipboardList, t: "SPO / Standar Prosedur Operasional", d: "Prosedur tindakan, alur pelayanan, dan protokol unit dari IGD sampai rawat inap." },
      { icon: Stethoscope, t: "Panduan Praktik Klinis (PPK)", d: "Acuan diagnosis dan tatalaksana yang ditetapkan komite medik rumah sakit Anda." },
      { icon: HeartPulse, t: "Panduan Asuhan Keperawatan", d: "Standar asuhan dan dokumentasi keperawatan yang harus diikuti tiap shift." },
      { icon: BadgeCheck, t: "Dokumen Akreditasi & Regulasi Internal", d: "Kebijakan, pedoman, dan panduan yang harus dipahami staf saat survei berlangsung." },
      { icon: Pill, t: "Formularium Obat", d: "Daftar obat, restriksi, dan alternatif yang tersedia di instalasi farmasi Anda." },
      { icon: ShieldCheck, t: "Kebijakan PPI & K3RS", d: "Pencegahan dan pengendalian infeksi, keselamatan kerja, dan pelaporan insiden." },
      { icon: ScrollText, t: "Panduan Administrasi & Klaim", d: "Alur rujukan, syarat berkas, dan prosedur administrasi pasien." },
    ],

    qTitle: "Pertanyaan yang Sering Muncul di Lapangan",
    qDesc: "Contoh pertanyaan yang bisa dijawab AI — selama dokumen sumbernya sudah Anda unggah.",
    questions: [
      "Apa clinical pathway untuk pasien stroke iskemik akut?",
      "Berapa target length of stay untuk demam berdarah dewasa?",
      "Bagaimana SPO pemasangan kateter urin?",
      "Apa alur pelaporan insiden keselamatan pasien?",
      "Obat ini ada di formularium atau tidak, dan apa alternatifnya?",
      "Bagaimana prosedur rujukan pasien ke rumah sakit tipe B?",
    ],

    whyTitle: "Kenapa Ini Berbeda di Rumah Sakit",
    why: [
      { icon: Moon, t: "Pelayanan berjalan 24 jam", d: "Pertanyaan prosedur muncul jam 3 pagi, saat bagian mutu tidak bisa dihubungi dan supervisor sedang menangani pasien lain." },
      { icon: RefreshCw, t: "Dokumen berlapis dan sering direvisi", d: "Revisi terbaru sering kalah cepat dari fotokopi lama yang menempel di dinding ruangan. AI menjawab dari versi yang Anda unggah." },
      { icon: MessageSquare, t: "Staf baru dan rotasi terus berganti", d: "Perawat orientasi, dokter internsip, dan staf pindah unit semuanya mengulang pertanyaan yang sama ke orang yang sama." },
    ],

    isolationTitle: "Data Tiap Rumah Sakit Terisolasi Penuh",
    isolationDesc: "Isolasi antar tenant ditegakkan di level database, bukan hanya di kode aplikasi. Dokumen rumah sakit Anda tidak bisa terbaca oleh tenant lain.",

    disclaimerTitle: "Yang perlu diluruskan sejak awal",
    disclaimer: "IntelliBase AI adalah alat pencarian dokumen internal, bukan alat pengambilan keputusan klinis. Jawaban selalu bersumber dari dokumen yang rumah sakit Anda unggah sendiri, dan keputusan medis sepenuhnya tetap berada pada tenaga kesehatan. Platform ini ditujukan untuk dokumen kebijakan dan prosedur — bukan untuk rekam medis pasien.",

    founderTitle: "Siapa di balik IntelliBase",

    ctaTitle: "Coba dengan Satu Clinical Pathway Anda",
    ctaDesc: "Upload satu dokumen, ajukan lima pertanyaan, dan nilai sendiri jawabannya. Gratis, tanpa kartu kredit.",
    back: "Lihat semua industri",
  },
  en: {
    nav: { price: "Pricing", login: "Sign In", start: "Start Free", roi: "ROI Calculator" },
    badge: "🏥 For Hospitals & Clinics",
    title1: "Clinical Pathways and SOPs,",
    title2: "Answered in Seconds",
    desc: "Night-shift nurses, on-call doctors, and new staff no longer dig through binders or comb shared drives. They ask the way they would ask a senior colleague — and the answer comes from your hospital's own official documents.",
    cta1: "Start Free Now",
    cta2: "View Pricing",
    ctaNote: "Free forever for small teams · No credit card required",

    docsTitle: "Documents You Can Upload",
    docsDesc: "PDF, DOCX, Excel, and PowerPoint — exactly the files already sitting on your quality department's computer.",
    docs: [
      { icon: Activity, t: "Clinical Pathways", d: "Care pathways per diagnosis, including target length of stay and discharge criteria." },
      { icon: ClipboardList, t: "Standard Operating Procedures", d: "Procedures, service flows, and unit protocols from the ER to inpatient wards." },
      { icon: Stethoscope, t: "Clinical Practice Guidelines", d: "Diagnosis and treatment references set by your hospital's medical committee." },
      { icon: HeartPulse, t: "Nursing Care Standards", d: "Care and documentation standards every shift is expected to follow." },
      { icon: BadgeCheck, t: "Accreditation & Internal Regulations", d: "Policies and guidelines staff need to know when surveyors are on the floor." },
      { icon: Pill, t: "Drug Formulary", d: "Available drugs, restrictions, and alternatives stocked by your pharmacy." },
      { icon: ShieldCheck, t: "Infection Control & Safety Policies", d: "Infection prevention, occupational safety, and incident reporting." },
      { icon: ScrollText, t: "Administration & Claims Guides", d: "Referral flows, document requirements, and patient administration procedures." },
    ],

    qTitle: "Questions That Actually Come Up on the Floor",
    qDesc: "Examples the AI can answer — as long as you have uploaded the source document.",
    questions: [
      "What is the clinical pathway for acute ischemic stroke?",
      "What is the target length of stay for adult dengue fever?",
      "What is the SOP for urinary catheter insertion?",
      "How do I report a patient safety incident?",
      "Is this drug on the formulary, and what are the alternatives?",
      "What is the referral procedure to a type B hospital?",
    ],

    whyTitle: "Why This Is Different in a Hospital",
    why: [
      { icon: Moon, t: "Care runs 24 hours a day", d: "Procedure questions arrive at 3 a.m., when the quality department is unreachable and the supervisor is with another patient." },
      { icon: RefreshCw, t: "Documents are layered and revised often", d: "The latest revision loses to the old photocopy taped to the ward wall. The AI answers from the version you uploaded." },
      { icon: MessageSquare, t: "Staff rotate constantly", d: "Orientation nurses, interns, and staff moving between units all repeat the same questions to the same people." },
    ],

    isolationTitle: "Every Hospital's Data Is Fully Isolated",
    isolationDesc: "Tenant isolation is enforced at the database level, not just in application code. Your hospital's documents cannot be read by another tenant.",

    disclaimerTitle: "One thing to be clear about up front",
    disclaimer: "IntelliBase AI is an internal document search tool, not a clinical decision-making tool. Answers always come from documents your hospital uploaded itself, and medical decisions remain entirely with your healthcare professionals. The platform is intended for policy and procedure documents — not for patient medical records.",

    founderTitle: "Who is behind IntelliBase",

    ctaTitle: "Try It With One of Your Clinical Pathways",
    ctaDesc: "Upload one document, ask five questions, and judge the answers yourself. Free, no credit card.",
    back: "See all industries",
  },
};

export function HospitalSolutionContent() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar — same shape as the landing page's, so arriving here from a
          search result still looks like the same site. */}
      <nav className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link href="/"><LogoFull size="sm" className="shrink-0" /></Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/roi" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.nav.roi}</Link>
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">{T.nav.price}</Link>
            <Link href="/login"><Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.nav.login}</Button></Link>
            <Link href="/register"><Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">{T.nav.start}</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-14 px-6">
        <div className="max-w-4xl mx-auto">
          <span className="inline-block bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full mb-6">{T.badge}</span>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
            {T.title1}<br />
            <span className="text-teal-600">{T.title2}</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">{T.desc}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register"><Button size="lg" className="bg-teal-600 hover:bg-teal-700 gap-2 h-12 px-8">{T.cta1} <ArrowRight className="h-5 w-5" /></Button></Link>
            <Link href="/pricing"><Button size="lg" className="bg-gray-900 hover:bg-gray-700 text-white gap-2 h-12 px-8 shadow-sm">{T.cta2} <ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
          <p className="text-xs text-gray-400 mt-4">{T.ctaNote}</p>
        </div>
      </section>

      {/* Document types */}
      <section className="py-14 px-6 bg-sunken">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{T.docsTitle}</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">{T.docsDesc}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {T.docs.map((d) => (
              <div key={d.t} className="rounded-xl border border-hairline bg-raised p-5">
                <div className="p-2 bg-teal-50 rounded-lg w-fit mb-3"><d.icon className="h-5 w-5 text-teal-600" /></div>
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{d.t}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{d.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example questions */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-3">{T.qTitle}</h2>
            <p className="text-gray-500">{T.qDesc}</p>
          </div>
          <ul className="space-y-3">
            {T.questions.map((q) => (
              <li key={q} className="flex items-start gap-3 rounded-xl border border-hairline p-4 bg-raised">
                <MessageSquare className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-gray-700">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why hospitals */}
      <section className="py-14 px-6 bg-sunken">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-gray-900 mb-10 text-center">{T.whyTitle}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {T.why.map((w) => (
              <div key={w.t} className="rounded-xl border border-hairline bg-raised p-6">
                <div className="p-2 bg-teal-50 rounded-lg w-fit mb-3"><w.icon className="h-5 w-5 text-teal-600" /></div>
                <h3 className="font-semibold text-gray-900 mb-2">{w.t}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{w.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Isolation + disclaimer. These sit together on purpose: both are answers
          to the same question a hospital asks before uploading anything. */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 text-teal-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-bold text-gray-900 mb-1">{T.isolationTitle}</h2>
                <p className="text-gray-600 text-sm leading-relaxed">{T.isolationDesc}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-hairline bg-sunken p-6">
            <div className="flex items-start gap-3">
              <Info className="h-6 w-6 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-bold text-gray-900 mb-1">{T.disclaimerTitle}</h2>
                <p className="text-gray-600 text-sm leading-relaxed">{T.disclaimer}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who is behind this. Deliberately placed after the isolation and
          disclaimer block rather than up in the hero: read early it is a
          credential being waved, read here it is the answer to the question the
          disclaimer just raised — who decided where the line between "document
          search" and "clinical decision" sits.

          Same guard and same source as the landing page's block, so the two can
          never tell different stories about who is behind the product. */}
      {FOUNDER.name.trim() && FOUNDER.intro[lang]?.trim() && (
        <section className="py-16 px-6 border-t">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 mb-4">{T.founderTitle}</p>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">&ldquo;{FOUNDER.intro[lang]}&rdquo;</p>
            <p className="font-semibold text-gray-900">{FOUNDER.name}</p>
            <p className="text-sm text-gray-500">{FOUNDER.role[lang]}</p>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-700 to-[#061C24] py-20 px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-white mb-4">{T.ctaTitle}</h2>
        <p className="text-teal-100 text-lg mb-8 max-w-2xl mx-auto">{T.ctaDesc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register"><Button size="lg" className="bg-white text-teal-600 hover:bg-teal-50 gap-2 font-semibold h-12 px-8">{T.cta1} <ArrowRight className="h-5 w-5" /></Button></Link>
          <Link href="/pricing"><Button size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8">{T.cta2}</Button></Link>
        </div>
        <Link href="/" className="inline-block mt-8 text-sm text-teal-100 hover:text-white underline underline-offset-4">{T.back}</Link>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
