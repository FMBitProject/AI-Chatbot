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
};

export const INDUSTRIES: Industry[] = [
  {
    key: "rumah-sakit",
    href: "/solusi/rumah-sakit",
    name: { id: "Rumah Sakit & Klinik", en: "Hospitals & Clinics" },
    docs: {
      id: "Clinical pathway, SPO, PPK, panduan akreditasi",
      en: "Clinical pathways, SOPs, clinical practice guidelines, accreditation docs",
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
