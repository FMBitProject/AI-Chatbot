import type { Metadata } from "next";
import { LogoFull } from "@/components/Logo";
import { AnalyticsOptOutToggle } from "@/components/AnalyticsOptOutToggle";

export const metadata: Metadata = {
  title: "Pengaturan Analytics",
  robots: { index: false, follow: false },
};

export default function AnalyticsOptOutPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <LogoFull size="md" className="mb-8" />
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Pengaturan Analytics</h2>
      <p className="text-gray-500 text-sm mb-6 max-w-sm">
        Halaman internal untuk mengecualikan kunjungan kita sendiri dari statistik
        pengunjung. Pengaturan ini berlaku per browser, jadi perlu diaktifkan sekali
        di tiap perangkat yang dipakai untuk testing.
      </p>
      <AnalyticsOptOutToggle />
    </div>
  );
}
