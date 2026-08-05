import type { Lang } from "./i18n";

// The industries named on the landing page's vertical strip, and the document
// vocabulary each one recognises. The point of the strip is that a visitor can
// see their own paperwork named — "clinical pathway" lands with a hospital in a
// way "dokumen internal" never does — so `docs` carries the industry's real
// terms rather than a generic restatement of the product.
//
// Each entry keeps both languages side by side instead of the page-level
// `CONTENT = { id: {...}, en: {...} }` shape used elsewhere: the list is a
// registry keyed by route, and splitting it in two is how an industry ends up
// present in one language and missing in the other, or how `href` gets attached
// to the wrong row after a reorder.
export type Industry = {
  key: string;
  // A vertical earns an `href` only once its page actually exists. The strip
  // renders linked and unlinked entries differently, so this field is what
  // stops a card from looking clickable while going nowhere.
  href?: string;
  name: Record<Lang, string>;
  docs: Record<Lang, string>;
  // The copy for the one vertical promoted out of the strip into a band of its
  // own. It lives here, next to that industry's name and route, rather than in
  // the landing page's `CONTENT`, so promoting a different vertical later is one
  // edit in one file instead of a band whose headline still says "rumah sakit"
  // while it links somewhere else.
  featured?: {
    eyebrow: Record<Lang, string>;
    headline: Record<Lang, string>;
    body: Record<Lang, string>;
    // Concrete situations, not benefits. Each one has to be something a visitor
    // from this industry recognises as their own Tuesday.
    points: Record<Lang, string[]>;
    cta: Record<Lang, string>;
  };
};

export const INDUSTRIES: Industry[] = [
  {
    key: "rumah-sakit",
    href: "/solusi/rumah-sakit",
    name: { id: "Rumah Sakit & Klinik", en: "Hospitals & Clinics" },
    docs: {
      id: "Clinical pathway, SPO, PPK, panduan akreditasi",
      en: "Clinical pathways, SOPs, practice guidelines, accreditation docs",
    },
    // Promoted to the featured band because this is the vertical the founder
    // actually comes from — the claim being made is "we know this floor", which
    // is true here and would not be true of the other four.
    featured: {
      eyebrow: { id: "🏥 Fokus utama kami", en: "🏥 Where we go deepest" },
      headline: {
        id: "Dibangun oleh dokter, untuk rumah sakit & klinik",
        en: "Built by a doctor, for hospitals & clinics",
      },
      body: {
        id: "Rumah sakit adalah industri yang kami dalami paling serius. Clinical pathway, SPO, PPK, formularium, dan dokumen akreditasi punya istilah dan siklus revisinya sendiri — dan pertanyaannya jarang muncul di jam kerja.",
        en: "Hospitals are the industry we have gone deepest on. Clinical pathways, SOPs, practice guidelines, formularies, and accreditation documents each carry their own vocabulary and revision cycle — and the questions rarely arrive during office hours.",
      },
      points: {
        id: [
          "Pertanyaan prosedur muncul jam 3 pagi, saat bagian mutu tidak bisa dihubungi",
          "Revisi terbaru sering kalah cepat dari fotokopi lama yang menempel di dinding ruangan",
          "Perawat orientasi dan dokter internsip mengulang pertanyaan yang sama ke orang yang sama",
        ],
        en: [
          "Procedure questions arrive at 3 a.m., when the quality department is unreachable",
          "The latest revision loses to the old photocopy taped to the ward wall",
          "Orientation nurses and interns repeat the same questions to the same people",
        ],
      },
      cta: { id: "Lihat solusi rumah sakit", en: "See the hospital solution" },
    },
  },
  {
    key: "manufaktur",
    name: { id: "Manufaktur", en: "Manufacturing" },
    docs: {
      id: "SOP produksi, instruksi kerja, K3, dokumen ISO",
      en: "Production SOPs, work instructions, safety, ISO documents",
    },
  },
  {
    key: "keuangan",
    name: { id: "Jasa Keuangan", en: "Financial Services" },
    docs: {
      id: "Kebijakan kredit, prosedur kepatuhan, APU-PPT",
      en: "Credit policies, compliance procedures, AML/CFT",
    },
  },
  {
    key: "pendidikan",
    name: { id: "Pendidikan", en: "Education" },
    docs: {
      id: "Panduan akademik, SOP administrasi, kebijakan kepegawaian",
      en: "Academic handbooks, administrative SOPs, staff policies",
    },
  },
  {
    key: "retail",
    name: { id: "Retail & F&B", en: "Retail & F&B" },
    docs: {
      id: "SOP outlet, standar layanan, panduan inventori",
      en: "Outlet SOPs, service standards, inventory guides",
    },
  },
];

// The promoted vertical, and everything else. Both are derived here rather than
// filtered at the call site so the two can never disagree — an industry showing
// up in the featured band *and* in the row below it would read as a bug to a
// visitor and as duplicate content to a crawler.
//
// `href` is part of the condition, not just `featured`: the band's whole payload
// is a link to a deeper page, and a featured entry without one would render a
// call to action pointing nowhere.
export const FEATURED_INDUSTRY =
  INDUSTRIES.find((i) => i.featured && i.href) ?? null;

export const OTHER_INDUSTRIES = INDUSTRIES.filter(
  (i) => i.key !== FEATURED_INDUSTRY?.key,
);
