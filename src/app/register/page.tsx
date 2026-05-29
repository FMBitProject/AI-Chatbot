"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { BrainCircuit, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    companyName: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Registrasi Gagal", description: data.error });
        return;
      }
      await authClient.signIn.email({ email: form.email, password: form.password });
      toast({ title: "Berhasil!", description: "Akun admin berhasil dibuat." });
      router.push("/admin");
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Terjadi kesalahan. Silakan coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Toaster />
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">TanyaInternal AI</span>
          </div>
          <p className="text-gray-500 text-sm">Daftarkan perusahaan Anda sekarang</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Daftar sebagai Admin</CardTitle>
            <CardDescription>Buat akun admin sekaligus daftarkan instansi perusahaan baru</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nama Perusahaan</Label>
                <Input
                  id="companyName"
                  placeholder="PT. Maju Bersama"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nama Lengkap Admin</Label>
                <Input
                  id="name"
                  placeholder="Budi Santoso"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@perusahaan.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Kata Sandi</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimal 8 karakter"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Daftar &amp; Buat Perusahaan
              </Button>
              <p className="text-sm text-center text-gray-500">
                Sudah punya akun?{" "}
                <Link href="/login" className="text-blue-600 hover:underline font-medium">
                  Masuk di sini
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
