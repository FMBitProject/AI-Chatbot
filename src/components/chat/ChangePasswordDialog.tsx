"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { KeyRound, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import { isPasswordValid } from "@/lib/password";
import { authClient } from "@/lib/auth-client";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const isDemoAccount = userEmail === "demo@intellibase.app";

  // 2FA state
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [twoFaOtp, setTwoFaOtp] = useState("");
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "otp">("idle");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    authClient.getSession().then(({ data }) => {
      const user = data?.user as { twoFactorEnabled?: boolean; email?: string } | null;
      setTwoFaEnabled(!!user?.twoFactorEnabled);
      setUserEmail(user?.email ?? "");
    });
  }, [open]);

  function handleClose() {
    setForm({ current: "", next: "", confirm: "" });
    setTwoFaPassword("");
    setTwoFaOtp("");
    setTwoFaStep("idle");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordValid(form.next)) {
      toast({ variant: "destructive", title: "Password tidak memenuhi persyaratan." });
      return;
    }
    if (form.next !== form.confirm) {
      toast({ variant: "destructive", title: "Password tidak cocok." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      if (!res.ok) {
        const d = await res.json() as { error: string };
        toast({ variant: "destructive", title: d.error });
        return;
      }
      toast({ title: "Password berhasil diubah!" });
      setForm({ current: "", next: "", confirm: "" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Gagal mengubah password." });
    } finally {
      setLoading(false);
    }
  }

  // "Password salah." only when the server actually said so. The old fallback
  // used it for every error without a message — including the 500 that every
  // enable attempt produced while the twoFactor table was missing. A user whose
  // password was correct was told it was wrong, so they blamed their own typing
  // and never reported it; the bug stayed invisible for exactly as long as the
  // message stayed confident. An error we cannot name gets named as what it is:
  // ours, not theirs.
  function twoFaErrorText(error: { code?: string; message?: string }): string {
    if (error.code === "INVALID_PASSWORD") return "Password salah.";
    return error.message ?? "Terjadi kesalahan pada server. Coba lagi, atau hubungi kami jika berlanjut.";
  }

  async function handle2FaToggle() {
    if (!twoFaPassword) {
      toast({ variant: "destructive", title: "Masukkan password untuk konfirmasi." });
      return;
    }
    setTwoFaLoading(true);
    try {
      if (!twoFaEnabled) {
        // Enable: send OTP first then verify
        const { error } = await authClient.twoFactor.enable({ password: twoFaPassword });
        if (error) {
          toast({ variant: "destructive", title: "Gagal", description: twoFaErrorText(error) });
          return;
        }
        await authClient.twoFactor.sendOtp();
        setTwoFaStep("otp");
      } else {
        // Disable
        const { error } = await authClient.twoFactor.disable({ password: twoFaPassword });
        if (error) {
          toast({ variant: "destructive", title: "Gagal", description: twoFaErrorText(error) });
          return;
        }
        setTwoFaEnabled(false);
        setTwoFaPassword("");
        toast({ title: "Verifikasi 2 Langkah dinonaktifkan." });
      }
    } finally {
      setTwoFaLoading(false);
    }
  }

  async function handle2FaVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (twoFaOtp.length !== 6) { toast({ variant: "destructive", title: "Kode harus 6 digit." }); return; }
    setTwoFaLoading(true);
    try {
      const { error } = await authClient.twoFactor.verifyOtp({ code: twoFaOtp });
      if (error) {
        toast({ variant: "destructive", title: "Kode salah atau kedaluwarsa." });
        return;
      }
      setTwoFaEnabled(true);
      setTwoFaStep("idle");
      setTwoFaPassword("");
      setTwoFaOtp("");
      toast({ title: "Verifikasi 2 Langkah berhasil diaktifkan!" });
    } finally {
      setTwoFaLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-teal-600" /> Pengaturan Akun
          </DialogTitle>
        </DialogHeader>

        {/* Ganti Password */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Ganti Password</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Password Saat Ini</Label>
              <Input type="password" placeholder="Password lama" value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Password Baru</Label>
              <Input type="password" placeholder="Minimal 8 karakter" value={form.next}
                onChange={(e) => setForm({ ...form, next: e.target.value })} required />
              <PasswordRequirements password={form.next} />
            </div>
            <div className="space-y-1.5">
              <Label>Konfirmasi Password Baru</Label>
              <Input type="password" placeholder="Ulangi password baru" value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </div>
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan Password Baru"}
            </Button>
          </form>
        </div>

        {!isDemoAccount && <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                {twoFaEnabled
                  ? <ShieldCheck className="h-4 w-4 text-green-600" />
                  : <ShieldOff className="h-4 w-4 text-gray-400" />}
                Verifikasi 2 Langkah
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {twoFaEnabled ? "Aktif — kode OTP dikirim ke email saat login" : "Nonaktif"}
              </p>
            </div>
          </div>

          {twoFaStep === "otp" ? (
            <form onSubmit={handle2FaVerifyOtp} className="space-y-3">
              <p className="text-xs text-gray-500">Masukkan kode 6 digit yang dikirim ke email Anda untuk mengonfirmasi aktivasi.</p>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={twoFaOtp}
                onChange={(e) => setTwoFaOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-[0.4em] font-bold"
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1"
                  onClick={() => { setTwoFaStep("idle"); setTwoFaOtp(""); }}>
                  Batal
                </Button>
                <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700"
                  disabled={twoFaLoading || twoFaOtp.length !== 6}>
                  {twoFaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifikasi"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <Input type="password" placeholder="Masukkan password untuk konfirmasi"
                value={twoFaPassword} onChange={(e) => setTwoFaPassword(e.target.value)} />
              <Button
                type="button"
                variant={twoFaEnabled ? "destructive" : "default"}
                className={twoFaEnabled ? "" : "bg-teal-600 hover:bg-teal-700"}
                onClick={handle2FaToggle}
                disabled={twoFaLoading || !twoFaPassword}
                size="sm"
              >
                {twoFaLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : twoFaEnabled ? "Nonaktifkan 2FA" : "Aktifkan 2FA"}
              </Button>
            </div>
          )}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
