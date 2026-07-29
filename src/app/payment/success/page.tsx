"use client";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const plan = params.get("plan") ?? "professional";
  const planName = plan === "enterprise" ? "Enterprise" : "Professional";
  const [verifying, setVerifying] = useState(true);
  const [upgraded, setUpgraded] = useState(false);
  // Whether the *check itself* failed (throttled, network, our own error), as
  // opposed to the payment genuinely not being settled yet. Both used to render
  // the same "sedang diverifikasi" copy, which blamed the payment for our fault.
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch("/api/payment/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = await res.json() as { upgraded?: boolean };
        if (!res.ok) setCheckFailed(true);
        else setUpgraded(data.upgraded ?? false);
      } catch { setCheckFailed(true); }
      finally { setVerifying(false); }
    }
    verify();
  }, [plan]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center shadow-sm">
        <LogoFull size="md" className="justify-center mb-6" />
        {verifying ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-gray-500 text-sm">Memverifikasi pembayaran...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {upgraded ? "Pembayaran Berhasil!" : "Pembayaran Diterima"}
            </h1>
            <p className="text-gray-500 text-sm mb-1">
              {upgraded
                ? "Akun Anda telah diupgrade ke paket"
                : checkFailed
                ? "Pembayaran Anda tercatat. Kami belum bisa memastikan statusnya saat ini, tapi akun Anda akan diupgrade otomatis ke paket"
                : "Pembayaran sedang diverifikasi. Akun Anda akan diupgrade ke paket"}
            </p>
            <p className="text-blue-600 font-bold text-lg mb-6">✦ {planName}</p>
            {!upgraded && (
              <p className="text-xs text-gray-400 mb-4">
                Jika belum terupgrade dalam beberapa menit, klik &ldquo;Cek Status&rdquo; di dashboard.
              </p>
            )}
            <Link href="/admin">
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                Kembali ke Dashboard →
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return <Suspense><SuccessContent /></Suspense>;
}
