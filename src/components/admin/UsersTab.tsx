"use client";
import { useState } from "react";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Users, KeyRound } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { PasswordRequirements } from "@/components/ui/PasswordRequirements";
import { isPasswordValid } from "@/lib/password";

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: "admin" | "employee";
  createdAt: string;
}

interface UsersTabProps {
  employees: Employee[];
  companyName?: string;
  onAddEmployee: (data: { name: string; email: string; password: string }) => Promise<void>;
  lang?: Lang;
}

export function UsersTab({ employees, companyName, onAddEmployee, lang = "id" }: UsersTabProps) {
  const T = adminT[lang];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", department: "" });
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordValid(form.password)) {
      toast({ variant: "destructive", title: lang === "en" ? "Password does not meet requirements." : "Password tidak memenuhi persyaratan." });
      return;
    }
    setLoading(true);
    try {
      await onAddEmployee(form);
      toast({ title: "Karyawan ditambahkan!", description: `${form.name} berhasil didaftarkan.` });
      setOpen(false);
      setForm({ name: "", email: "", password: "", department: "" });
    } catch (err) {
      const msg = (err as Error).message;
      toast({
        variant: "destructive",
        title: msg || (lang === "en" ? "Failed to add employee." : "Gagal menambahkan karyawan."),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget || !isPasswordValid(newPassword)) {
      toast({ variant: "destructive", title: lang === "en" ? "Password does not meet requirements." : "Password tidak memenuhi persyaratan." });
      return;
    }
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) throw new Error();
      // The reset itself succeeded either way; `notified` only says whether the
      // employee was told. Say so plainly when it wasn't, so the admin knows to
      // pass the new password on themselves rather than assume it was mailed.
      const { notified } = await res.json() as { notified?: boolean };
      toast(notified === false
        ? {
            title: lang === "en" ? "Password reset — employee not notified" : "Password direset — karyawan belum diberi tahu",
            description: lang === "en"
              ? "The new password is active, but the notification email could not be sent. Tell them yourself."
              : "Password baru sudah aktif, tapi email pemberitahuan gagal terkirim. Beri tahu karyawannya langsung.",
          }
        : { title: lang === "en" ? "Password reset successfully." : "Password berhasil direset." });
      setResetTarget(null);
      setNewPassword("");
    } catch {
      toast({ variant: "destructive", title: lang === "en" ? "Failed to reset password." : "Gagal mereset password." });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{lang === "en" ? "Manage Employees" : "Kelola Karyawan"}</h2>
            {companyName && (
              <span className="text-xs font-medium bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 border">
                🏢 {companyName}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{employees.length} {T.employees}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          {T.addEmployee}
        </Button>
      </div>
      {employees.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border rounded-xl">
          <Users className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{T.noEmployee}</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden overflow-x-auto">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow>
                <TableHead>{T.colName2}</TableHead>
                <TableHead>{T.colEmail}</TableHead>
                <TableHead>{T.colRole}</TableHead>
                <TableHead>{T.colJoin}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {emp.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{emp.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500">{emp.email}</TableCell>
                  <TableCell>
                    <Badge variant={emp.role === "admin" ? "default" : "secondary"}>
                      {emp.role === "admin" ? "Admin" : "Karyawan"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {new Date(emp.createdAt).toLocaleDateString("id-ID")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-blue-600" title={lang === "en" ? "Reset Password" : "Reset Password"} onClick={() => { setResetTarget(emp); setNewPassword(""); }}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "en" ? "Add New Employee" : "Tambah Karyawan Baru"}</DialogTitle>
            <DialogDescription>{lang === "en" ? "Employees can log in using the email and password you create." : "Karyawan akan dapat login menggunakan email dan password yang dibuat."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="emp-name">{lang === "en" ? "Full Name" : "Nama Lengkap"}</Label>
              <Input id="emp-name" placeholder={lang === "en" ? "John Doe" : "Budi Santoso"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-email">Email</Label>
              <Input id="emp-email" type="email" placeholder={lang === "en" ? "john@company.com" : "budi@perusahaan.com"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-dept">{lang === "en" ? "Department (optional)" : "Departemen (opsional)"}</Label>
              <Input id="emp-dept" placeholder={lang === "en" ? "e.g. HR, IT, Legal" : "Contoh: HR, IT, Legal"} value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-password">{lang === "en" ? "Temporary Password" : "Password Sementara"}</Label>
              <Input id="emp-password" type="password" placeholder={lang === "en" ? "Min. 8 characters" : "Minimal 8 karakter"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              <PasswordRequirements password={form.password} lang={lang} />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading ? (lang === "en" ? "Adding..." : "Menambahkan...") : T.addEmployee}
            </Button>
            <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
              <p className="text-xs text-amber-700 leading-relaxed">
                {lang === "en"
                  ? "By adding this employee, you as admin are responsible for ensuring this person is an authorized member of your organization."
                  : "Dengan menambahkan karyawan ini, Anda sebagai admin bertanggung jawab memastikan orang ini adalah anggota resmi organisasi Anda."}
              </p>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "en" ? "Reset Password" : "Reset Password"}</DialogTitle>
            <DialogDescription>
              {lang === "en"
                ? `Set a new password for ${resetTarget?.name ?? "this employee"}.`
                : `Set password baru untuk ${resetTarget?.name ?? "karyawan ini"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>{lang === "en" ? "New Password" : "Password Baru"}</Label>
              <Input
                type="password"
                placeholder={lang === "en" ? "Min. 8 characters" : "Minimal 8 karakter"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordRequirements password={newPassword} lang={lang} />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleResetPassword} disabled={resetting || !isPasswordValid(newPassword)}>
              {resetting ? (lang === "en" ? "Resetting..." : "Mereset...") : (lang === "en" ? "Reset Password" : "Reset Password")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
