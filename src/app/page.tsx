import { LandingContent } from "@/components/LandingContent";
import { PriceClockProvider } from "@/lib/price-clock";
import { requestPriceTime } from "@/lib/price-clock-server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntelliBase AI: Knowledge Base AI untuk Rumah Sakit & Klinik",
  description: "SPO, PPK, clinical pathway, dan formularium rumah sakit & klinik Anda jadi asisten AI yang menjawab pertanyaan staf kapan saja, lengkap dengan dokumen sumbernya.",
  // Self-referencing canonical. The site is linked from social posts that carry
  // UTM parameters, and without this every `?utm_source=...` variant is a
  // separate page to a crawler, splitting the ranking signal of one page across
  // several near-identical URLs.
  alternates: { canonical: "/" },
  // Deliberately no `openGraph` key. Nested metadata objects are not merged —
  // a child segment that defines `openGraph` replaces the parent's entirely, so
  // setting just a `url` here silently dropped the card's title, description,
  // site_name, locale, and the image resolved from opengraph-image.tsx.
};

// TODO: MINOR — requestPriceTime() (connection()) membuat homepage (halaman paling ramai, termasuk
// trafik iklan) dirender per request, padahal harga hanya berubah sekali di batas
// promo. `export const revalidate = 300` (ISR) sudah cukup: harga paling lama
// basi 5 menit, dan checkout tetap menagih memakai jam server.
export default async function HomePage() {
  // One server timestamp for every price on the page, read per request; see
  // price-clock.tsx.
  const now = await requestPriceTime();
  return (
    <PriceClockProvider now={now}>
      <LandingContent />
    </PriceClockProvider>
  );
}
