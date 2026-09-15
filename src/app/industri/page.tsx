import { IndustriesContent } from "@/components/IndustriesContent";
import type { Metadata } from "next";

// The industries the homepage used to list under "Juga cocok untuk industri
// lain". They moved here when the homepage was repositioned around hospitals and
// clinics, so a manufacturing or finance visitor still has a page that names
// their own paperwork instead of a hero written for a ward.
export const metadata: Metadata = {
  // No brand suffix: the root layout's title template adds it.
  title: "Knowledge Base AI untuk Berbagai Industri",
  description:
    "Selain rumah sakit & klinik, IntelliBase AI cocok untuk manufaktur, jasa keuangan, pendidikan, dan retail: SOP, instruksi kerja, dan kebijakan internal dijawab AI dari dokumen resmi Anda.",
  // No `openGraph` key, for the reason spelled out in src/app/page.tsx: a
  // per-page one replaces the layout's and drops the social card image.
  alternates: { canonical: "/industri" },
};

export default function IndustriesPage() {
  return <IndustriesContent />;
}
