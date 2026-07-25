"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { Loader2, ShieldCheck, Zap, BookOpen } from "lucide-react";
import { t } from "@/lib/i18n";
import { SiteFooter } from "@/components/SiteFooter";

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useLang();
  const T = t[lang];
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  // Verification is required before login, so anyone whose mail was lost would
  // otherwise be stuck with no way forward. Offer a resend right here.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);

  async function resendVerification() {
    setResending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({ email: form.email, callbackURL: "/admin" });
      toast(error
        ? { variant: "destructive", title: T.loginFailed, description: error.message }
        : {
          title: lang === "en" ? "Verification email sent" : "Email verifikasi terkirim",
          description: lang === "en"
            ? "Check your inbox, and your spam folder too."
            : "Cek kotak masuk Anda, termasuk folder spam.",
        });
    } finally { setResending(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNeedsVerification(false);
    try {
      const { data, error } = await authClient.signIn.email({ email: form.email, password: form.password });
      // 2FA: onTwoFactorRedirect handles redirect automatically, so data will be null — don't show error
      if (error && error.code !== "SECOND_FACTOR_REQUIRED") {
        if (error.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
        toast({ variant: "destructive", title: T.loginFailed, description: error.message });
        return;
      }
      if (!data) return; // 2FA redirect in progress
      const user = data.user as { role?: string } | null;
      router.push(user?.role === "admin" ? "/admin" : "/chat");
    } catch {
      toast({ variant: "destructive", title: "Error", description: T.error });
    } finally { setLoading(false); }
  }

  const FEATURES = [
    { icon: BookOpen, title: T.f1Title, desc: T.f1Desc },
    { icon: Zap, title: T.f2Title, desc: T.f2Desc },
    { icon: ShieldCheck, title: T.f3Title, desc: T.f3Desc },
  ];

  return (
    <>
    <div className="min-h-screen flex">
      <Toaster />

      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[55%] bg-gradient-to-br from-[#061C24] via-[#0A2E2E] to-[#061C24] p-12 justify-between">
        <Link href="/"><LogoFull size="md" variant="white" /></Link>
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4 whitespace-pre-line">{T.hero1}</h1>
            <p className="text-teal-100 text-lg leading-relaxed">{T.heroDesc}</p>
          </div>
          <div className="space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="p-2 bg-white/10 rounded-lg mt-0.5 shrink-0">
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-teal-100 text-sm">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-teal-200 text-sm">© 2026 IntelliBase · B2B Knowledge Management Platform</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col p-8 bg-gray-50">
        {/* Top bar */}
        <div className="flex justify-end mb-auto">
          <LanguageSwitcher />
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm space-y-8">
            <div className="lg:hidden mb-2 flex justify-center">
              <LogoFull size="md" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{T.welcome}</h2>
              <p className="text-gray-500 text-sm mt-1">{T.subtitle}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{T.email}</Label>
                <Input id="email" type="email" placeholder={T.emailPlaceholder}
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{T.password}</Label>
                <Input id="password" type="password" placeholder={T.passwordPlaceholder}
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 h-11" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {T.login}
              </Button>
            </form>
            {needsVerification && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center space-y-2">
                <p className="text-sm text-amber-900">
                  {lang === "en"
                    ? "This account still needs email verification before you can sign in."
                    : "Akun ini perlu verifikasi email dulu sebelum bisa masuk."}
                </p>
                <Button variant="outline" size="sm" onClick={resendVerification} disabled={resending || !form.email}>
                  {resending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === "en" ? "Resend verification email" : "Kirim ulang email verifikasi"}
                </Button>
              </div>
            )}
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-500">
                {T.noAccount}{" "}
                <Link href="/register" className="text-teal-600 hover:underline font-medium">{T.register}</Link>
              </p>
              <Link href="/pricing" className="text-xs text-gray-400 hover:text-gray-600 block">{T.viewPricing}</Link>
            </div>
          </div>
        </div>

        <div className="mt-auto" />
      </div>
    </div>
    <SiteFooter lang={lang} />
    </>
  );
}
