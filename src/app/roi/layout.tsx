import type { Metadata } from "next";

// Client component; see the note in ../pricing/layout.tsx for why the metadata
// lives here.
//
// "Estimasi" and "asumsi" are load-bearing words, not hedging for its own sake:
// the calculator's inputs are the visitor's own guesses and its assumption is
// documented in `src/lib/roi.ts`. A description promising a measured saving
// would be the same unbacked claim the landing page already had to walk back.
export const metadata: Metadata = {
  title: "Kalkulator ROI Knowledge Base",
  description:
    "Hitung estimasi waktu dan biaya yang terbuang saat karyawan mencari SOP, kebijakan HR, dan panduan internal secara manual. Berdasarkan asumsi yang bisa Anda sesuaikan sendiri.",
  // No `openGraph` key — see the note in src/app/page.tsx.
  alternates: { canonical: "/roi" },
};

export default function RoiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
