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
import { LogoFull, LogoIcon } from "@/components/Logo";
import { Loader2, ShieldCheck, Zap, BookOpen } from "lucide-react";

const FEATURES = [
  { icon: BookOpen, title: "Knowledge Base Terpusat", desc: "Semua SOP dan regulasi dalam satu platform" },
  { icon: Zap, title: "Jawaban Instan", desc: "AI menjawab dalam hitungan detik berdasarkan dokumen resmi" },
  { icon: ShieldCheck, title: "Aman & Terisolasi", desc: "Data tiap perusahaan terisolasi penuh, tidak bocor" },
];

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await authClient.signIn.email({ email: form.email, password: form.password });
      if (error) { toast({ variant: "destructive", title: "Login Gagal", description: error.message }); return; }
      const user = data?.user as { role?: string } | null;
      router.push(user?.role === "admin" ? "/admin" : "/chat");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Terjadi kesalahan. Silakan coba lagi." });
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      <Toaster />
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[55%] bg-gradient-to-br from-blue-700 via-blue-600 to-violet-700 p-12 justify-between">
        <LogoFull size="md" variant="white" />
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Knowledge Base Cerdas<br />untuk Tim Internal Anda
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed">
              Akses SOP, regulasi, dan panduan perusahaan secara instan dengan kekuatan AI — tanpa perlu membuka dokumen satu per satu.
            </p>
          </div>
          <div className="space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="p-2 bg-white/10 rounded-lg mt-0.5">
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">{f.title}</p>
                  <p className="text-blue-100 text-sm">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-blue-200 text-sm">© 2026 TanyaInternal AI · Platform B2B Knowledge Management</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden mb-2 flex justify-center">
            <LogoFull size="md" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Selamat datang kembali</h2>
            <p className="text-gray-500 text-sm mt-1">Masuk ke akun perusahaan Anda</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="nama@perusahaan.com"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Kata Sandi</Label>
              <Input id="password" type="password" placeholder="Masukkan kata sandi"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-11" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Masuk
            </Button>
          </form>
          <div className="text-center space-y-3">
            <p className="text-sm text-gray-500">
              Belum punya akun?{" "}
              <Link href="/register" className="text-blue-600 hover:underline font-medium">Daftar Perusahaan</Link>
            </p>
            <Link href="/pricing" className="text-xs text-gray-400 hover:text-gray-600 block">Lihat paket harga →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
