"use client";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const plan = params.get("plan") ?? "professional";
  const planName = plan === "enterprise" ? "Enterprise" : "Professional";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center shadow-sm">
        <LogoFull size="md" className="justify-center mb-6" />
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Pembayaran Berhasil!</h1>
        <p className="text-gray-500 text-sm mb-1">
          Selamat! Akun Anda telah diupgrade ke paket
        </p>
        <p className="text-blue-600 font-bold text-lg mb-6">✦ {planName}</p>
        <p className="text-xs text-gray-400 mb-6">
          Semua fitur paket {planName} kini aktif. Nikmati pengalaman IntelliBase yang lebih lengkap.
        </p>
        <Link href="/admin">
          <Button className="w-full bg-blue-600 hover:bg-blue-700">Kembali ke Dashboard →</Button>
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
