"use client";
import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab, type Document } from "@/components/admin/DocumentsTab";
import { UsersTab, type Employee } from "@/components/admin/UsersTab";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import { PersonaTab } from "@/components/admin/PersonaTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { OnboardingBanner } from "@/components/admin/OnboardingBanner";
import { RenewalBanner } from "@/components/admin/RenewalBanner";
import { SubscriptionTab } from "@/components/admin/SubscriptionTab";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
import { FileText, Users, LogOut, MessageSquare, BarChart2, Sparkles, ClipboardList, CreditCard, MoreVertical } from "lucide-react";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { admin as adminT } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user as { name?: string } | undefined;
  const router = useRouter();
  // Whether this visitor may see the dashboard, decided by the server rather
  // than by session.user.role: that field is served from a 7-day cookie cache
  // (see auth.ts), so a freshly promoted admin would read as an employee and be
  // bounced for a week. "denied" also keeps the banners and tabs unmounted, so a
  // non-admin never fires their fetches or sees a flash of the dashboard.
  const [access, setAccess] = useState<"checking" | "granted" | "denied">("checking");
  const { lang } = useLang();
  const T = adminT[lang];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [plan, setPlan] = useState<"starter" | "professional" | "enterprise">("starter");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadDocuments() {
    const res = await fetch("/api/admin/documents").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => null) as Document[] | null;
    if (Array.isArray(data)) setDocuments(data);
  }

  useEffect(() => {
    let cancelled = false;

    // A request that never settles would otherwise strand the page on its
    // loading state, which is the same dead dashboard this gate exists to
    // prevent. Feature-detected because AbortSignal.timeout throws on older
    // browsers, and it is evaluated as an argument — outside the reach of the
    // .catch() on the fetch itself.
    const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(8000)
      : undefined;

    async function start() {
      // proxy.ts guards /admin on the presence of a session cookie, not on whose
      // it is, so an employee who types the URL still lands here. /api/admin/company
      // gives the authoritative answer — it re-reads the role from the database —
      // and doubles as the request that fills the header, so this costs no extra
      // round trip.
      const res = await fetch("/api/admin/company", { signal: timeout }).catch(() => null);
      if (cancelled) return;

      if (res && (res.status === 401 || res.status === 403)) {
        setAccess("denied");
        router.replace(res.status === 401 ? "/login" : "/chat");
        return;
      }

      // Every other outcome — a timeout, a network error, a 500 — falls through
      // to "granted" on purpose. This gate exists to spare a non-admin a broken
      // dashboard, not to enforce anything; the API is the boundary and answers
      // for itself on every call. Failing it closed would let one flaky request
      // lock a legitimate admin out of their own dashboard.
      setAccess("granted");

      if (res?.ok) {
        const data = await res.json().catch(() => null) as
          { name?: string; plan?: "starter" | "professional" | "enterprise" } | null;
        if (!cancelled && data) {
          setCompanyName(data.name ?? "");
          if (data.plan) setPlan(data.plan);
        }
      }

      if (cancelled) return;
      fetch("/api/admin/documents").then((r) => r.ok ? r.json() : null).then((data: Document[] | null) => {
        if (!cancelled && Array.isArray(data)) setDocuments(data);
      }).catch(() => {});
      fetch("/api/admin/users").then((r) => r.ok ? r.json() : null).then((data: Employee[] | null) => {
        if (!cancelled && Array.isArray(data)) setEmployees(data);
      }).catch(() => {});
    }

    // Last resort: anything unexpected thrown in there must still leave the page
    // usable rather than stuck on "checking" forever.
    start().catch((error) => {
      console.error("[admin] access check failed:", error);
      if (!cancelled) setAccess("granted");
    });
    return () => { cancelled = true; };
  }, [router]);

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
    // Report the reason the server recorded rather than guessing at one. With
    // several failures the toast stays short and points at the document list,
    // where each failed row shows its own reason.
    const failed = allDocs.filter((d) => d.status === "failed");
    if (failed.length > 0) {
      throw new Error(
        failed.length === 1
          ? failed[0].errorMessage ?? "Dokumen gagal diproses."
          : `${failed.length} dari ${allDocs.length} dokumen gagal diproses. Lihat alasannya di daftar dokumen di bawah.`
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
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <LogoFull size="sm" className="shrink-0" />
          <span className="hidden sm:inline text-xs font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 shrink-0">Admin</span>
          {companyName && <span className="hidden md:inline text-sm text-gray-400 shrink-0">·</span>}
          {companyName && <span className="hidden md:inline text-sm font-medium text-gray-600 truncate">{companyName}</span>}
          <span className={`hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
            plan === "enterprise" ? "bg-teal-100 text-teal-700 border-teal-200" :
            plan === "professional" ? "bg-teal-100 text-teal-700 border-teal-200" :
            "bg-gray-100 text-gray-500 border-gray-200"
          }`}>
            {plan === "enterprise" ? "⚡ Enterprise" : plan === "professional" ? "✦ Pro" : "Free"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageSwitcher className="hidden sm:flex" />
          <span className="hidden md:inline text-sm text-gray-500 truncate max-w-[100px]">{user?.name ?? "Admin"}</span>
          <Link href="/chat">
            <Button variant="outline" size="sm" className="gap-1.5">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{T.openChat}</span>
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 hidden sm:inline-flex">
            <LogOut className="h-4 w-4" />
            {T.logout}
          </Button>
          {/* Mobile menu */}
          <div className="relative sm:hidden">
            <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen((o) => !o)}>
              <MoreVertical className="h-4 w-4" />
            </Button>
            {mobileMenuOpen && (
              <div className="absolute right-0 top-9 z-50 bg-white border rounded-xl shadow-lg p-3 w-48 space-y-2">
                <p className="text-xs font-medium text-gray-500 px-2">{user?.name ?? "Admin"}</p>
                <LanguageSwitcher />
                <Button variant="ghost" size="sm" onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="w-full justify-start gap-2 text-red-500 hover:text-red-600">
                  <LogOut className="h-4 w-4" />
                  {T.logout}
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">{T.title}</h1>
        {access !== "granted" ? (
          // Nothing below this point may mount before access is settled: the
          // banners and tabs each fetch their own admin endpoint on mount, so
          // rendering them for a visitor on their way out to /chat is a burst of
          // 403s and a flash of a dashboard that was never theirs.
          <div className="text-center py-16 text-gray-400 text-sm">
            {access === "checking" ? T.loading : null}
          </div>
        ) : (
        <>
        <RenewalBanner lang={lang} />
        <OnboardingBanner hasDocuments={documents.length > 0} hasEmployees={employees.length > 1} lang={lang} />
        <Tabs defaultValue="documents">
          <TabsList className="mb-6 w-full overflow-x-auto flex-nowrap justify-start">
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
        </>
        )}
      </main>
    </div>
  );
}
