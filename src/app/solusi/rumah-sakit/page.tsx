import { HospitalSolutionContent } from "@/components/HospitalSolutionContent";
import type { Metadata } from "next";

// Indonesian only, matching the site's default language: this page exists partly
// to be found by a hospital searching in Indonesian, and the terms it should
// rank for ("clinical pathway", "SPO rumah sakit") are the ones staff type.
export const metadata: Metadata = {
  // No "— IntelliBase AI" suffix here. The root layout defines
  // `title.template: "%s — IntelliBase AI"`, which does not apply to the
  // homepage (same route segment as the layout) but *does* apply to every child
  // segment — so spelling the brand out here rendered it twice, at 79
  // characters, past where a search result truncates.
  title: "Knowledge Base AI untuk Rumah Sakit & Klinik",
  description:
    "Clinical pathway, SPO, PPK, panduan akreditasi, dan formularium rumah sakit Anda jadi asisten AI yang menjawab pertanyaan staf dalam hitungan detik. Data tiap rumah sakit terisolasi penuh.",
  alternates: { canonical: "/solusi/rumah-sakit" },
  openGraph: { url: "/solusi/rumah-sakit" },
};

export default function HospitalSolutionPage() {
  return <HospitalSolutionContent />;
}
