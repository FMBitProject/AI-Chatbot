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

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await authClient.signIn.email({
        email: form.email,
        password: form.password,
      });
      if (error) {
        toast({ variant: "destructive", title: "Login Gagal", description: error.message });
        return;
      }
      const user = data?.user as { role?: string } | null;
      if (user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/chat");
      }
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
          <p className="text-gray-500 text-sm">Platform pengetahuan internal perusahaan berbasis AI</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Masuk ke Akun Anda</CardTitle>
            <CardDescription>Masukkan email dan kata sandi untuk melanjutkan</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
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
                  placeholder="Masukkan kata sandi"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Masuk
              </Button>
              <p className="text-sm text-center text-gray-500">
                Belum punya akun?{" "}
                <Link href="/register" className="text-blue-600 hover:underline font-medium">
                  Daftar Perusahaan
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
