"use client";
import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab, type Document } from "@/components/admin/DocumentsTab";
import { UsersTab, type Employee } from "@/components/admin/UsersTab";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { FileText, Users, LogOut, MessageSquare, BarChart2 } from "lucide-react";
import { LogoFull } from "@/components/Logo";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string } | undefined;

  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadDocuments();
    fetch("/api/admin/users").then((r) => r.json()).then((data: Employee[]) => setEmployees(data)).catch(() => {});
    fetch("/api/admin/company").then((r) => r.json()).then((data: { name: string }) => setCompanyName(data?.name ?? "")).catch(() => {});
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(loadDocuments, 3000);
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [documents]);

  async function loadDocuments() {
    const res = await fetch("/api/admin/documents").catch(() => null);
    if (res?.ok) {
      const data = await res.json() as Document[];
      setDocuments(data);
    }
  }

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

  async function handleAddEmployee(data: { name: string; email: string; password: string; department?: string }) {
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
        <div className="flex items-center gap-3">
          <LogoFull size="sm" />
          <span className="text-xs font-medium bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">Admin</span>
          {companyName && (
            <span className="hidden sm:inline text-sm text-gray-400">·</span>
          )}
          {companyName && (
            <span className="hidden sm:inline text-sm font-medium text-gray-600">{companyName}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.name ?? "Admin"}</span>
          <Link href="/chat">
            <Button variant="outline" size="sm">
              <MessageSquare className="h-4 w-4" />
              Buka Chat
            </Button>
          </Link>
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
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Analitik
            </TabsTrigger>
          </TabsList>
          <TabsContent value="documents">
            <DocumentsTab documents={documents} onUpload={handleUpload} onDelete={handleDelete} />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab employees={employees} companyName={companyName} onAddEmployee={handleAddEmployee} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
