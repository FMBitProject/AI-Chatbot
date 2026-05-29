"use client";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Users } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: "admin" | "employee";
  createdAt: string;
}

interface UsersTabProps {
  employees: Employee[];
  onAddEmployee: (data: { name: string; email: string; password: string }) => Promise<void>;
}

export function UsersTab({ employees, onAddEmployee }: UsersTabProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", department: "" });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onAddEmployee(form);
      toast({ title: "Karyawan ditambahkan!", description: `${form.name} berhasil didaftarkan.` });
      setOpen(false);
      setForm({ name: "", email: "", password: "", department: "" });
    } catch (err) {
      toast({ variant: "destructive", title: "Gagal menambahkan karyawan.", description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Kelola Karyawan</h2>
          <p className="text-sm text-gray-500">{employees.length} karyawan terdaftar</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Tambah Karyawan
        </Button>
      </div>
      {employees.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border rounded-xl">
          <Users className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Belum ada karyawan terdaftar</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Bergabung</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Karyawan Baru</DialogTitle>
            <DialogDescription>Karyawan akan dapat login menggunakan email dan password yang dibuat.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="emp-name">Nama Lengkap</Label>
              <Input id="emp-name" placeholder="Budi Santoso" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-email">Email</Label>
              <Input id="emp-email" type="email" placeholder="budi@perusahaan.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-dept">Departemen (opsional)</Label>
              <Input id="emp-dept" placeholder="Contoh: HR, IT, Legal" value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-password">Password Sementara</Label>
              <Input id="emp-password" type="password" placeholder="Minimal 8 karakter" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Menambahkan..." : "Tambah Karyawan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
