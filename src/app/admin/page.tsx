"use client";
import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab, type Document } from "@/components/admin/DocumentsTab";
import { UsersTab, type Employee } from "@/components/admin/UsersTab";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import { PersonaTab } from "@/components/admin/PersonaTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { OnboardingBanner } from "@/components/admin/OnboardingBanner";
import { SubscriptionTab } from "@/components/admin/SubscriptionTab";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { FileText, Users, LogOut, MessageSquare, BarChart2, Sparkles, ClipboardList, CreditCard } from "lucide-react";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { admin as adminT } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export default function AdminPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string } | undefined;
  const { lang } = useLang();
  const T = adminT[lang];

  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [plan, setPlan] = useState<"starter" | "professional" | "enterprise">("starter");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadDocuments() {
    const res = await fetch("/api/admin/documents").catch(() => null);
    if (res?.ok) {
      const data = await res.json() as Document[];
      setDocuments(data);
    }
  }

  useEffect(() => {
    fetch("/api/admin/documents").then((r) => r.ok ? r.json() : null).then((data: Document[] | null) => {
      if (data) setDocuments(data);
    }).catch(() => {});
    fetch("/api/admin/users").then((r) => r.json()).then((data: Employee[]) => setEmployees(data)).catch(() => {});
    fetch("/api/admin/company").then((r) => r.json()).then((data: { name: string; plan: "starter" | "professional" | "enterprise" }) => {
      setCompanyName(data?.name ?? "");
      if (data?.plan) setPlan(data.plan);
    }).catch(() => {});
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

  async function handleUpload(files: File[]) {
    const allDocs: Document[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Upload gagal");
      }
      const data = await res.json() as { documents: Document[] };
      allDocs.push(...data.documents);
      setDocuments((prev) => [...data.documents, ...prev]);
    }
    const failedCount = allDocs.filter((d) => d.status === "failed").length;
    if (failedCount > 0) {
      throw new Error(
        failedCount === allDocs.length
          ? "Dokumen gagal diproses. Pastikan format file didukung."
          : `${failedCount} dari ${allDocs.length} dokumen gagal diproses.`
      );
    }
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
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoFull size="sm" />
          <span className="text-xs font-medium bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">Admin</span>
          {companyName && <span className="hidden sm:inline text-sm text-gray-400">·</span>}
          {companyName && <span className="hidden sm:inline text-sm font-medium text-gray-600">{companyName}</span>}
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
            plan === "enterprise" ? "bg-violet-100 text-violet-700 border-violet-200" :
            plan === "professional" ? "bg-blue-100 text-blue-700 border-blue-200" :
            "bg-gray-100 text-gray-500 border-gray-200"
          }`}>
            {plan === "enterprise" ? "⚡ Enterprise" : plan === "professional" ? "✦ Professional" : "Free"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <span className="text-sm text-gray-500">{user?.name ?? "Admin"}</span>
          <Link href="/chat">
            <Button variant="outline" size="sm">
              <MessageSquare className="h-4 w-4" />
              {T.openChat}
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            {T.logout}
          </Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">{T.title}</h1>
        <OnboardingBanner hasDocuments={documents.length > 0} hasEmployees={employees.length > 1} lang={lang} />
        <Tabs defaultValue="documents">
          <TabsList className="mb-6">
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {T.tabs.documents}
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {T.tabs.users}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              {T.tabs.analytics}
            </TabsTrigger>
            <TabsTrigger value="persona" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {T.tabs.persona}
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {T.tabs.audit}
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {lang === "en" ? "Subscription" : "Langganan"}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="documents">
            <DocumentsTab documents={documents} onUpload={handleUpload} onDelete={handleDelete} lang={lang} />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab employees={employees} companyName={companyName} onAddEmployee={handleAddEmployee} lang={lang} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab lang={lang} />
          </TabsContent>
          <TabsContent value="persona">
            <PersonaTab lang={lang} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditTab lang={lang} />
          </TabsContent>
          <TabsContent value="subscription">
            <SubscriptionTab lang={lang} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
