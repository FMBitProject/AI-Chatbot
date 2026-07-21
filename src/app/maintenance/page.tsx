import type { Metadata } from "next";
import { LogoFull } from "@/components/Logo";
import { Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Sedang Dalam Perbaikan",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <LogoFull size="md" className="mb-8" />
      <div className="flex justify-center mb-4">
        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
          <Wrench className="h-8 w-8 text-blue-500" />
        </div>
      </div>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Sedang Dalam Perbaikan</h2>
      <p className="text-gray-500 text-sm mb-1 max-w-sm">
        Kami sedang melakukan peningkatan sistem untuk memberikan layanan yang lebih
        baik. Silakan kembali beberapa saat lagi.
      </p>
      <p className="text-gray-400 text-xs max-w-sm">
        We&apos;re performing scheduled maintenance and will be back shortly. Thank you
        for your patience.
      </p>
    </div>
  );
}
