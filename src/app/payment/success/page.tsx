"use client";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const plan = params.get("plan") ?? "professional";
  const planName = plan === "enterprise" ? "Enterprise" : "Professional";
  const [verifying, setVerifying] = useState(true);
  const [upgraded, setUpgraded] = useState(false);
  // How the *check itself* went, as opposed to whether the payment settled —
  // both used to render the same "sedang diverifikasi" copy, which blamed the
  // customer's payment for our own failures.
  //   "retryable" — throttled, network, or our error; the webhook still settles
  //                 the order on its own, so promising the upgrade is honest.
  //   "unknown"   — 4xx we cannot recover from (no such order, not an admin);
  //                 nothing is going to upgrade this account, so don't say it will.
  const [checkFailed, setCheckFailed] = useState<null | "retryable" | "unknown">(null);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch("/api/payment/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = await res.json() as { upgraded?: boolean };
        if (res.ok) setUpgraded(data.upgraded ?? false);
        else setCheckFailed(res.status === 429 || res.status >= 500 ? "retryable" : "unknown");
      } catch { setCheckFailed("retryable"); }
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
            {/* A green tick above "we could not confirm your payment" would be
                its own small lie, so that case gets a neutral badge. */}
            <div className="flex justify-center mb-4">
              {checkFailed === "unknown" ? (
                <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {upgraded
                ? "Pembayaran Berhasil!"
                : checkFailed === "unknown"
                ? "Status Belum Dapat Dipastikan"
                : "Pembayaran Diterima"}
            </h1>
            <p className="text-gray-500 text-sm mb-1">
              {upgraded
                ? "Akun Anda telah diupgrade ke paket"
                : checkFailed === "unknown"
                ? "Kami belum bisa memastikan status pembayaran Anda untuk paket"
                : checkFailed === "retryable"
                ? "Pembayaran Anda tercatat. Kami belum bisa memastikan statusnya saat ini, tapi akun Anda akan diupgrade otomatis ke paket"
                : "Pembayaran sedang diverifikasi. Akun Anda akan diupgrade ke paket"}
            </p>
            <p className="text-blue-600 font-bold text-lg mb-6">✦ {planName}</p>
            {!upgraded && (
              <p className="text-xs text-gray-400 mb-4">
                {checkFailed === "unknown"
                  ? "Jika Anda sudah membayar, buka dashboard untuk memeriksa status pesanan Anda atau hubungi kami."
                  : "Jika belum terupgrade dalam beberapa menit, klik “Cek Status” di dashboard."}
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
