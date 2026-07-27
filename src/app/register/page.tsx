"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { Loader2, CheckCircle2, Mail } from "lucide-react";
import { t } from "@/lib/i18n";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import { isPasswordValid } from "@/lib/password";
import { SiteFooter } from "@/components/SiteFooter";

export default function RegisterPage() {
  const { lang } = useLang();
  const T = t[lang];
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Guard before the request, not after it: a rejected password must never
    // reach the server, or the account gets created and the verification mail
    // sent while the form still shows an error.
    if (!isPasswordValid(form.password)) {
      toast({ variant: "destructive", title: T.registerFailed, description: lang === "en" ? "Password does not meet requirements." : "Password tidak memenuhi persyaratan." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-admin", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast({ variant: "destructive", title: T.registerFailed, description: data.error }); return; }
      setRegisteredEmail(form.email);
      setRegistered(true);
    } catch {
      toast({ variant: "destructive", title: "Error", description: T.error });
    } finally { setLoading(false); }
  }

  const BENEFITS = [T.b1, T.b2, T.b3, T.b4];

  return (
    <>
    <div className="min-h-screen flex">
      <Toaster />

      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[45%] bg-gradient-to-br from-[#061C24] via-[#0A2E2E] to-[#061C24] p-12 justify-between">
        <Link href="/"><LogoFull size="md" variant="white" /></Link>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight mb-3 whitespace-pre-line">{T.heroRegister}</h1>
            <p className="text-teal-100 leading-relaxed">{T.heroRegisterDesc}</p>
          </div>
          <div className="space-y-3">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-300 shrink-0" />
                <span className="text-white text-sm">{b}</span>
              </div>
            ))}
          </div>
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-white text-sm font-medium mb-1">{T.tip}</p>
            <p className="text-teal-100 text-xs">{T.tipDesc}</p>
          </div>
        </div>
        <p className="text-teal-200 text-sm">© 2026 IntelliBase</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col p-8 bg-gray-50">
        {/* Top bar */}
        <div className="flex justify-end mb-auto">
          <LanguageSwitcher />
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm space-y-6">
            <div className="lg:hidden mb-2 flex justify-center">
              <LogoFull size="md" />
            </div>

            {registered ? (
              <div className="text-center space-y-4 py-8">
                <div className="flex justify-center">
                  <div className="bg-blue-100 rounded-full p-4">
                    <Mail className="h-10 w-10 text-teal-600" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{T.checkEmail}</h2>
                <p className="text-gray-600 text-sm">{T.checkEmailDesc}</p>
                <p className="font-semibold text-gray-900">{registeredEmail}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{T.checkEmailNote}</p>
              </div>
            ) : (<>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{T.registerTitle}</h2>
              <p className="text-gray-500 text-sm mt-1">{T.registerSubtitle}</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{T.companyName}</Label>
                <Input placeholder={T.companyPlaceholder} value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{T.fullName}</Label>
                <Input placeholder={T.namePlaceholder} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{T.email}</Label>
                <Input type="email" placeholder={T.emailPlaceholder} value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{T.password}</Label>
                <Input type="password" placeholder={T.passwordMin} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                <PasswordRequirements password={form.password} lang={lang} />
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agree"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer shrink-0"
                />
                <label htmlFor="agree" className="text-xs text-gray-500 leading-relaxed cursor-pointer">
                  {lang === "en" ? (
                    <>I agree to the{" "}
                      <Link href="/terms" className="text-teal-600 hover:underline" target="_blank">Terms & Conditions</Link>
                      {" "}and{" "}
                      <Link href="/privacy" className="text-teal-600 hover:underline" target="_blank">Privacy Policy</Link>
                    </>
                  ) : (
                    <>Saya menyetujui{" "}
                      <Link href="/terms" className="text-teal-600 hover:underline" target="_blank">Syarat & Ketentuan</Link>
                      {" "}dan{" "}
                      <Link href="/privacy" className="text-teal-600 hover:underline" target="_blank">Kebijakan Privasi</Link>
                    </>
                  )}
                </label>
              </div>
              <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 h-11" disabled={loading || !agreed || !isPasswordValid(form.password)}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {T.registerBtn}
              </Button>
            </form>
            <p className="text-sm text-center text-gray-500">
              {T.hasAccount}{" "}
              <Link href="/login" className="text-teal-600 hover:underline font-medium">{T.loginHere}</Link>
            </p>
            </>)}
          </div>
        </div>

        <div className="mt-auto" />
      </div>
    </div>
    <SiteFooter lang={lang} />
    </>
  );
}
