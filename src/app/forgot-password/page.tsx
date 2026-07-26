"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const { lang } = useLang();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    } finally {
      // The confirmation never says whether the address exists — otherwise this
      // page would tell a stranger which companies have accounts here.
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/"><LogoFull size="sm" /></Link>
        <LanguageSwitcher />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center">
                <MailCheck className="h-6 w-6 text-teal-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                {lang === "en" ? "Check your email" : "Cek email Anda"}
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                {lang === "en"
                  ? `If an account exists for ${email}, we've sent a link to reset the password. The link is valid for one hour.`
                  : `Jika ada akun terdaftar dengan ${email}, kami sudah mengirim link untuk mengatur ulang kata sandi. Link berlaku 1 jam.`}
              </p>
              <p className="text-xs text-gray-400">
                {lang === "en"
                  ? "Not there? Check your spam folder."
                  : "Tidak ada? Coba cek folder spam."}
              </p>
              <Link href="/login" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
                <ArrowLeft className="h-4 w-4" />
                {lang === "en" ? "Back to sign in" : "Kembali ke halaman masuk"}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                {lang === "en" ? "Forgot your password?" : "Lupa kata sandi?"}
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                {lang === "en"
                  ? "Enter your email and we'll send you a link to create a new one."
                  : "Masukkan email Anda, kami kirimkan link untuk membuat kata sandi baru."}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required autoFocus
                    placeholder="nama@perusahaan.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 h-11" disabled={loading || !email}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === "en" ? "Send reset link" : "Kirim Link"}
                </Button>
              </form>

              <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft className="h-4 w-4" />
                {lang === "en" ? "Back to sign in" : "Kembali ke halaman masuk"}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
