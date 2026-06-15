"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoFull } from "@/components/Logo";
import { Loader2, Mail, ShieldCheck } from "lucide-react";

export default function TwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const sentRef = useRef(false);

  async function sendOtp() {
    setSending(true);
    setError("");
    const { error } = await authClient.twoFactor.sendOtp();
    setSending(false);
    if (error) {
      setError("Gagal mengirim kode. Silakan coba lagi.");
      return;
    }
    setResendCooldown(60);
  }

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    sendOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { setError("Kode harus 6 digit."); return; }
    setVerifying(true);
    setError("");
    const { data, error } = await authClient.twoFactor.verifyOtp({ code });
    setVerifying(false);
    if (error) {
      setError("Kode salah atau sudah kedaluwarsa.");
      return;
    }
    const user = data?.user as { role?: string } | null;
    router.push(user?.role === "admin" ? "/admin" : "/chat");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-10 max-w-sm w-full shadow-sm space-y-6">
        <div className="flex justify-center">
          <LogoFull size="md" />
        </div>

        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-14 w-14 rounded-full bg-teal-50 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-teal-600" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Verifikasi 2 Langkah</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kode 6 digit telah dikirim ke email Anda.
            <br />Berlaku selama <strong>3 menit</strong>.
          </p>
        </div>

        {sending ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            <p className="text-sm text-gray-500">Mengirim kode ke email...</p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-bold h-14"
              autoFocus
            />
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 h-11"
              disabled={verifying || code.length !== 6}
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifikasi & Masuk"}
            </Button>
          </form>
        )}

        <div className="text-center">
          <p className="text-sm text-gray-500 mb-2">Tidak menerima kode?</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-teal-600 hover:text-teal-700 gap-2"
            onClick={sendOtp}
            disabled={sending || resendCooldown > 0}
          >
            <Mail className="h-4 w-4" />
            {resendCooldown > 0 ? `Kirim ulang (${resendCooldown}s)` : "Kirim ulang kode"}
          </Button>
        </div>
      </div>
    </div>
  );
}
