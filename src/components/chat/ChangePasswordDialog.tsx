"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { KeyRound } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-blue-600" /> Ganti Password
          </DialogTitle>
          <DialogDescription>Masukkan password lama dan password baru Anda.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Password Saat Ini</Label>
            <Input type="password" placeholder="Password lama" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Password Baru</Label>
            <Input type="password" placeholder="Minimal 8 karakter" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Konfirmasi Password Baru</Label>
            <Input type="password" placeholder="Ulangi password baru" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan Password Baru"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
