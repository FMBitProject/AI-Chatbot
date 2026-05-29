"use client";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab, type Document } from "@/components/admin/DocumentsTab";
import { UsersTab, type Employee } from "@/components/admin/UsersTab";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { BrainCircuit, FileText, Users, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string } | undefined;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    fetch("/api/admin/documents")
      .then((r) => r.json())
      .then((data: Document[]) => setDocuments(data))
      .catch(() => {});
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: Employee[]) => setEmployees(data))
      .catch(() => {});
  }, []);

  async function handleUpload(files: File[]) {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload gagal");
    const data = await res.json() as { documents: Document[] };
    setDocuments((prev) => [...data.documents, ...prev]);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/documents/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Hapus gagal");
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleAddEmployee(data: { name: string; email: string; password: string }) {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json() as { error: string };
      throw new Error(err.error);
    }
    const created = await res.json() as Employee;
    setEmployees((prev) => [created, ...prev]);
  }

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-lg">TanyaInternal AI</span>
          <span className="ml-2 text-xs font-medium bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name ?? "Admin"}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">Dashboard Admin</h1>
        <Tabs defaultValue="documents">
          <TabsList className="mb-6">
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Kelola Dokumen
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Kelola Karyawan
            </TabsTrigger>
          </TabsList>
          <TabsContent value="documents">
            <DocumentsTab documents={documents} onUpload={handleUpload} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab employees={employees} onAddEmployee={handleAddEmployee} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
