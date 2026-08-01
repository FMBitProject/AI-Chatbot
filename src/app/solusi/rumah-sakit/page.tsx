import { HospitalSolutionContent } from "@/components/HospitalSolutionContent";
import type { Metadata } from "next";

// Indonesian only, matching the site's default language: this page exists partly
// to be found by a hospital searching in Indonesian, and the terms it should
// rank for ("clinical pathway", "SPO rumah sakit") are the ones staff type.
export const metadata: Metadata = {
  title: "Knowledge Base AI untuk Rumah Sakit & Klinik — IntelliBase AI",
  description:
    "Clinical pathway, SPO, PPK, panduan akreditasi, dan formularium rumah sakit Anda jadi asisten AI yang menjawab pertanyaan staf dalam hitungan detik. Data tiap rumah sakit terisolasi penuh.",
};

export default function HospitalSolutionPage() {
  return <HospitalSolutionContent />;
}
