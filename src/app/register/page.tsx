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
import { Loader2, CheckCircle2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { SiteFooter } from "@/components/SiteFooter";

export default function RegisterPage() {
  const router = useRouter();
  const { lang } = useLang();
  const T = t[lang];
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-admin", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast({ variant: "destructive", title: T.registerFailed, description: data.error }); return; }
      await authClient.signIn.email({ email: form.email, password: form.password });
      router.push("/admin");
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
      <div className="hidden lg:flex flex-col w-[45%] bg-gradient-to-br from-violet-700 via-blue-600 to-blue-700 p-12 justify-between">
        <LogoFull size="md" variant="white" />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight mb-3 whitespace-pre-line">{T.heroRegister}</h1>
            <p className="text-blue-100 leading-relaxed">{T.heroRegisterDesc}</p>
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
            <p className="text-blue-100 text-xs">{T.tipDesc}</p>
          </div>
        </div>
        <p className="text-blue-200 text-sm">© 2026 IntelliBase</p>
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
                <Input type="password" placeholder={T.passwordMin} minLength={8} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-11" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {T.registerBtn}
              </Button>
              <p className="text-xs text-center text-gray-400">{T.terms}</p>
            </form>
            <p className="text-sm text-center text-gray-500">
              {T.hasAccount}{" "}
              <Link href="/login" className="text-blue-600 hover:underline font-medium">{T.loginHere}</Link>
            </p>
          </div>
        </div>

        <div className="mt-auto" />
      </div>
    </div>
    <SiteFooter lang={lang} />
    </>
  );
}
