// The one place the public support address is decided. It was previously
// re-derived from the same env-var-with-fallback expression in three separate
// components, which is how a stale value ends up live in one surface and not
// the others — and this address is now printed on the landing page, where a
// wrong one is a lead that never arrives.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@intellibaseai.com";

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
  role: { id: "Pendiri IntelliBase AI", en: "Founder, IntelliBase AI" },
  // Deliberately claims nothing biographical — no years of experience, no
  // former employer, no client count. It says why the product exists and stops
  // there, which is the one thing that cannot be wrong.
  intro: {
    id: "Saya membangun IntelliBase karena melihat pola yang sama berulang kali: dokumen dan SOP perusahaan sebenarnya sudah lengkap, tapi jawaban di dalamnya tetap sulit ditemukan justru ketika sedang dibutuhkan. Menurut saya karyawan tidak seharusnya menghabiskan setengah jam mencari satu aturan yang sudah ditulis rapi bertahun-tahun lalu.",
    en: "I built IntelliBase after seeing the same pattern over and over: a company's documents and SOPs are all there, yet the answer inside them is still hard to find at the exact moment someone needs it. Nobody should spend half an hour hunting for a rule that was written down properly years ago.",
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
