"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { Loader2, ArrowLeft, AlertTriangle } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useLang();
  // better-auth redirects here with ?token=… on success, or ?error=INVALID_TOKEN
  // when the link is expired or already used.
  const token = params.get("token");
  const linkError = params.get("error");

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const tooShort = form.password.length > 0 && form.password.length < 8;
  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: form.password, token });
      if (error) {
        toast({
          variant: "destructive",
          title: lang === "en" ? "Reset failed" : "Gagal mengatur ulang",
          description: error.message,
        });
        return;
      }
      toast({
        title: lang === "en" ? "Password updated" : "Kata sandi diperbarui",
        description: lang === "en" ? "Please sign in with your new password." : "Silakan masuk dengan kata sandi baru Anda.",
      });
      router.push("/login");
    } finally { setLoading(false); }
  }

  if (!token || linkError) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {lang === "en" ? "This link is no longer valid" : "Link ini sudah tidak berlaku"}
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          {lang === "en"
            ? "Reset links expire after an hour and can only be used once. Request a new one to continue."
            : "Link pengaturan ulang berlaku 1 jam dan hanya bisa dipakai sekali. Minta link baru untuk melanjutkan."}
        </p>
        <Link href="/forgot-password">
          <Button className="bg-teal-600 hover:bg-teal-700">
            {lang === "en" ? "Request a new link" : "Minta Link Baru"}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold text-gray-900 mb-1">
        {lang === "en" ? "Create a new password" : "Buat kata sandi baru"}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {lang === "en" ? "Minimum 8 characters." : "Minimal 8 karakter."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{lang === "en" ? "New password" : "Kata sandi baru"}</Label>
          <Input id="password" type="password" required autoFocus minLength={8}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {tooShort && (
            <p className="text-xs text-red-500">
              {lang === "en" ? "At least 8 characters." : "Minimal 8 karakter."}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{lang === "en" ? "Repeat password" : "Ulangi kata sandi"}</Label>
          <Input id="confirm" type="password" required
            value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          {mismatch && (
            <p className="text-xs text-red-500">
              {lang === "en" ? "Passwords don't match." : "Kata sandi tidak sama."}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 h-11"
          disabled={loading || tooShort || mismatch || !form.password || !form.confirm}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {lang === "en" ? "Save new password" : "Simpan Kata Sandi"}
        </Button>
      </form>

      <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" />
        {lang === "en" ? "Back to sign in" : "Kembali ke halaman masuk"}
      </Link>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster />
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/"><LogoFull size="sm" /></Link>
        <LanguageSwitcher />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <Suspense fallback={<div className="text-center text-sm text-gray-400">…</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
