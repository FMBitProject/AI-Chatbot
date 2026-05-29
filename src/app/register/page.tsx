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
import { Loader2, CheckCircle2 } from "lucide-react";

const BENEFITS = [
  "Gratis 14 hari, tidak perlu kartu kredit",
  "Setup dalam 5 menit",
  "Dukungan PDF & DOCX",
  "Isolasi data penuh antar perusahaan",
];

export default function RegisterPage() {
  const router = useRouter();
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
      if (!res.ok) { toast({ variant: "destructive", title: "Registrasi Gagal", description: data.error }); return; }
      await authClient.signIn.email({ email: form.email, password: form.password });
      router.push("/admin");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Terjadi kesalahan. Silakan coba lagi." });
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      <Toaster />
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[45%] bg-gradient-to-br from-violet-700 via-blue-600 to-blue-700 p-12 justify-between">
        <LogoFull size="md" variant="white" />
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight mb-3">
              Mulai gratis,<br />kembangkan sesuai kebutuhan
            </h1>
            <p className="text-blue-100 leading-relaxed">
              Daftarkan perusahaan Anda dan mulai transformasi cara karyawan mengakses informasi internal.
            </p>
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
            <p className="text-white text-sm font-medium mb-1">💡 Tahukah Anda?</p>
            <p className="text-blue-100 text-xs">Rata-rata karyawan menghabiskan 2,5 jam/hari mencari informasi internal. TanyaInternal AI memangkas waktu itu hingga 90%.</p>
          </div>
        </div>
        <p className="text-blue-200 text-sm">© 2026 TanyaInternal AI</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden mb-2 flex justify-center">
            <LogoFull size="md" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Daftar sebagai Admin</h2>
            <p className="text-gray-500 text-sm mt-1">Buat akun dan daftarkan perusahaan Anda</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Perusahaan</Label>
              <Input placeholder="PT. Maju Bersama" value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Nama Lengkap Admin</Label>
              <Input placeholder="Budi Santoso" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="admin@perusahaan.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Kata Sandi</Label>
              <Input type="password" placeholder="Minimal 8 karakter" minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-11" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Daftar & Mulai Gratis
            </Button>
            <p className="text-xs text-center text-gray-400">
              Dengan mendaftar, Anda menyetujui Syarat & Ketentuan kami
            </p>
          </form>
          <p className="text-sm text-center text-gray-500">
            Sudah punya akun?{" "}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">Masuk di sini</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
