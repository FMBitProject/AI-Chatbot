// The one place the public support address is decided. It was previously
// re-derived from the same env-var-with-fallback expression in three separate
// components, which is how a stale value ends up live in one surface and not
// the others — and this address is now printed on the landing page, where a
// wrong one is a lead that never arrives.
//
// `||` and a trim rather than `??`: a dashboard env var that exists but holds
// an empty string is far more likely than one that is truly unset, and `??`
// passes that empty string straight through — which here would print
// "Kontak: " with nothing after it and hand every CTA a `mailto:` with no
// recipient, silently, with no error anywhere.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "hello@intellibaseai.com";

// Who is behind IntelliBase. A company asked to upload its internal SOPs to a
// vendor it has never met wants to know there is a person on the other end, and
// for a one-person product naming that person reads as more honest than the
// "our team" phrasing that implies a company that does not exist yet.
//
// FILL THIS IN to switch the section on: while `name` is empty the block does
// not render at all, so the page never ships a placeholder identity. `intro` is
// one sentence in the founder's own voice — why this was built — and should
// stay first-person; a third-person bio undoes the point of the section.
export const FOUNDER = {
  name: "Ferel Manuputty",
  // The profession leads the role line because it is the single most useful
  // thing a hospital reading this page can know, and a role line is the part
  // that gets scanned. It is a statement of fact and nothing more: no
  // specialty, no institution, no seniority — those are claims that invite
  // verification and buy nothing the plain word does not already buy.
  role: {
    id: "Dokter · Pendiri IntelliBase AI",
    en: "Doctor · Founder, IntelliBase AI",
  },
  // Beyond the profession itself, this still claims nothing biographical — no
  // years of experience, no former employer, no client count, no patient
  // outcomes. It says where the problem was met first-hand and why the product
  // exists, and stops there. Keep any future edit inside that line: this page
  // was cleaned of unbacked claims once already, and a medical credential is
  // the worst possible place to reintroduce them.
  //
  // The last sentence is load-bearing, not filler: the landing page leads with
  // hospitals but sells to any industry, and this is where a manufacturing
  // visitor is told that the hospital framing is where it started, not the
  // limit of who it is for.
  intro: {
    id: "Saya seorang dokter, dan IntelliBase berangkat dari hal yang saya alami sendiri: dokumen dan SPO sebenarnya sudah lengkap, tapi jawabannya justru paling sulit ditemukan saat sedang dibutuhkan — jam 3 pagi, ketika tidak ada yang bisa ditanya. Saya belajar membangun software untuk menyelesaikan masalah itu, dan ternyata polanya sama persis di industri mana pun.",
    en: "I'm a doctor, and IntelliBase started from something I ran into myself: the documents and SOPs are all there, yet the answer inside them is hardest to find at the moment you actually need it — 3 a.m., with nobody around to ask. I taught myself to build software to solve that, and it turns out the same pattern shows up in every industry.",
  },
};

// A prefilled subject is the difference between a mail client opening on an
// empty draft — which most visitors abandon — and one that already looks like
// a message half-written. Kept per-language for the same reason the rest of
// the page is.
export function consultationMailto(lang: "id" | "en") {
  const subject =
    lang === "en"
      ? "Consultation request — IntelliBase AI"
      : "Permintaan konsultasi — IntelliBase AI";
  const body =
    lang === "en"
      ? "Hi IntelliBase team,\n\nI'd like to discuss whether IntelliBase fits our company.\n\nCompany:\nIndustry:\nNumber of employees:\nWhat we'd want the AI to answer:\n\nThanks,"
      : "Halo tim IntelliBase,\n\nSaya ingin berdiskusi apakah IntelliBase cocok untuk perusahaan kami.\n\nPerusahaan:\nIndustri:\nJumlah karyawan:\nPertanyaan yang ingin dijawab AI:\n\nTerima kasih,";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
