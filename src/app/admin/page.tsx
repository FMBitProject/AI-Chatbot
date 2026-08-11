"use client";
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab, type Document, type IndexProgress, type UploadOutcome } from "@/components/admin/DocumentsTab";
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
import type { Plan } from "@/lib/plan-limits";
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
  // Defaults to "company" so a dashboard that has not answered yet renders the
  // shape it has always had.
  //
  // The access gate below keeps everything unmounted while the check is in
  // flight, so this default is not shown during a normal load — but it *is*
  // shown when the check fails, because failure still grants access (see the
  // note there). The effect asks /api/user/me as a second chance in that case;
  // if both fail, an individual sees two tabs that are not theirs until they
  // reload. Defaulting the other way would be worse: every company admin would
  // lose employee management on one flaky request.
  const [accountType, setAccountType] = useState<"company" | "individual">("company");
  const isIndividual = accountType === "individual";
  // Shared Plan type rather than a union spelled out here: this state is set
  // straight from the API response, so a plan added in plan-limits.ts and not
  // repeated here would arrive at runtime while the type insisted it could not.
  const [plan, setPlan] = useState<Plan>("starter");

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

      // Read from the response rather than from state: setAccountType above
      // does not take effect until the next render, and the decision below
      // ("is there anyone to list?") is made in this one.
      let resolvedAccountType: "company" | "individual" = "company";

      if (res?.ok) {
        const data = await res.json().catch(() => null) as
          { name?: string; plan?: Plan; accountType?: "company" | "individual" } | null;
        if (!cancelled && data) {
          setCompanyName(data.name ?? "");
          if (data.plan) setPlan(data.plan);
          if (data.accountType) {
            setAccountType(data.accountType);
            resolvedAccountType = data.accountType;
          }
        }
      } else {
        // The request above failed — a timeout, a dropped connection, a 500 —
        // and the line before this one granted access anyway, on purpose. What
        // it could not do is say *what kind* of workspace this is, so the
        // account type falls back to its default and an individual account
        // renders with the Karyawan and Analitik tabs: two tabs that answer 403
        // and show one person's own activity respectively.
        //
        // One cheap second chance before settling for that. /api/user/me is a
        // different route with a different query, so a transient failure of the
        // first does not imply this one fails too, and it is the only question
        // still outstanding — the header's name and plan are cosmetic, the tab
        // list is not.
        //
        // No timeout signal: the one above may already have fired, and passing a
        // spent signal would abort this before it left. Its own failure is fine
        // and expected here — the default stands and a reload fixes it.
        const meRes = await fetch("/api/user/me").catch(() => null);
        if (cancelled) return;
        if (meRes?.ok) {
          const me = await meRes.json().catch(() => null) as
            { accountType?: "company" | "individual" } | null;
          if (!cancelled && me?.accountType) {
            setAccountType(me.accountType);
            resolvedAccountType = me.accountType;
          }
        }
      }

      if (cancelled) return;
      fetch("/api/admin/documents").then((r) => r.ok ? r.json() : null).then((data: Document[] | null) => {
        if (!cancelled && Array.isArray(data)) setDocuments(data);
      }).catch(() => {});
      // Skipped entirely for an individual account: there is no employee tab to
      // fill and the only row it could return is the person asking.
      if (resolvedAccountType === "company") {
        fetch("/api/admin/users").then((r) => r.ok ? r.json() : null).then((data: Employee[] | null) => {
          if (!cancelled && Array.isArray(data)) setEmployees(data);
        }).catch(() => {});
      }
    }

    // Last resort: anything unexpected thrown in there must still leave the page
    // usable rather than stuck on "checking" forever.
    start().catch((error) => {
      console.error("[admin] access check failed:", error);
      if (!cancelled) setAccess("granted");
    });
    return () => { cancelled = true; };
  }, [router]);

  // "queued" counts as in-flight too: the indexer may be another tab's pass or
  // the nightly cron, so the list has to keep refreshing even when this page is
  // not the one doing the work.
  const hasPendingDocuments = documents.some((d) => d.status === "processing" || d.status === "queued");

  useEffect(() => {
    if (!hasPendingDocuments) return;
    const id = setInterval(loadDocuments, 3000);
    return () => clearInterval(id);
    // Depends on the boolean, not on `documents`. Keyed to the array, this
    // effect re-ran on every poll — and its cleanup cleared the interval it had
    // just created, while the old guard (`!pollingRef.current`) saw a ref still
    // holding the dead timer id and declined to start a new one. The list
    // therefore refreshed exactly once and then sat still, which is precisely
    // the state a queued import must not be left in.
  }, [hasPendingDocuments]);

  // Sends the files one request at a time and reports what happened to each.
  //
  // It used to throw on the first failure, which ended the loop: upload 500
  // documents, hit a bad file at number 137, and the remaining 363 were never
  // even attempted — with nothing on screen to say where it stopped. A batch is
  // now only finished when every file has an answer, and a failure is data the
  // caller can act on rather than an exception that discards the rest.
  async function handleUpload(files: File[], folder: string | null, onProgress: (done: number) => void): Promise<UploadOutcome[]> {
    const outcomes: UploadOutcome[] = [];

    for (const [index, file] of files.entries()) {
      try {
        const formData = new FormData();
        formData.append("files", file);
        // Sent with every file because each one is its own request — this loop
        // is what keeps a 500-document import inside Vercel's body limit.
        if (folder) formData.append("folder", folder);
        const res = await fetch("/api/admin/upload", { method: "POST", body: formData });

        if (res.status === 413) {
          // Two different senders answer 413 here: our route, with a JSON reason,
          // and Vercel itself, which rejects an oversized body at the edge before
          // the route runs and replies with its own error page. The second is the
          // one that used to surface as a bare "Upload gagal" with no explanation
          // anywhere, so it gets a written reason rather than a shrug.
          const body = await res.json().catch(() => null) as { error?: string } | null;
          outcomes.push({ file, error: body?.error ?? T.payloadTooLarge });
        } else if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          outcomes.push({ file, error: body?.error ?? "Upload gagal." });
        } else {
          const data = await res.json() as { documents: Document[]; error?: string };
          setDocuments((prev) => [...data.documents, ...prev]);
          const failedDoc = data.documents.find((d) => d.status === "failed");
          outcomes.push(
            data.error ? { file, error: data.error }
              : failedDoc ? { file, error: failedDoc.errorMessage ?? "Dokumen gagal diproses." }
                : { file }
          );
        }
      } catch {
        // A dropped connection mid-import: the file is not stored, so it belongs
        // in the retry list like any other failure.
        outcomes.push({ file, error: "Koneksi terputus saat mengupload file ini." });
      }
      onProgress(index + 1);
    }

    return outcomes;
  }

  // Drives the server's indexing queue until it is empty.
  //
  // Each call indexes for as long as one serverless invocation may run and
  // reports what is left, so this loop is what turns a 500-document import into
  // a series of bounded requests. Stopping early — a closed tab, a network drop
  // — loses nothing: the queue lives in the database and the nightly cron
  // drains whatever is left.
  async function handleIndex(onProgress: (progress: IndexProgress) => void): Promise<void> {
    let rateLimitedRuns = 0;
    // What this run has actually finished, accumulated across passes. Reported
    // alongside `remaining` because the two answer different questions:
    // `remaining` is the company's whole queue and can grow under us — a second
    // admin uploading, a document requeued by a rate limit — while this only
    // ever counts work that is done.
    let done = 0;

    for (;;) {
      const res = await fetch("/api/admin/indexing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Pengindeksan gagal dijalankan.");
      }

      const result = await res.json() as { indexed: number; failed: number; remaining: number; stop: string };
      await loadDocuments();
      done += result.indexed + result.failed;
      onProgress({ remaining: result.remaining, done });

      if (result.remaining === 0) return;

      if (result.stop === "busy") {
        // Another pass holds this company's queue — a second tab, or the cron
        // that happened to start first. Looping here would only ask the same
        // question every few seconds; the document list is already polling, so
        // the admin watches it drain either way.
        onProgress({ remaining: result.remaining, done, busy: true });
        return;
      }

      if (result.stop === "rate-limited") {
        // The embedding provider asked us to slow down and the document went
        // back in the queue untouched. Waiting is the correct response; giving
        // up after a few rounds is too, because the cron will finish the job
        // without the admin sitting here. Announced, because a minute of silence
        // is indistinguishable from a page that has died.
        if (++rateLimitedRuns > 3) return;
        onProgress({ remaining: result.remaining, done, waiting: true });
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }

      // A pass that moved nothing and was not rate-limited would repeat forever.
      if (result.indexed === 0 && result.failed === 0) return;
    }
  }

  // Puts one failed document back in the queue and indexes it, without the file
  // being uploaded again — its extracted text is already stored.
  async function handleReindex(documentId: string): Promise<void> {
    const res = await fetch("/api/admin/indexing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? T.reindexFailed);
    }
    await loadDocuments();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/documents/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Hapus gagal");
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSetFolder(id: string, folder: string | null) {
    const res = await fetch(`/api/admin/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "Gagal memindahkan dokumen.");
    }
    // Patched in place rather than re-fetching the list: the server has already
    // stored it, the row is the only thing that changed, and a refetch here
    // would fight the three-second poll that runs during an import.
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, department: folder } : d)));
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
          {/* "Admin" is a role among colleagues; on a one-person workspace there
              is nobody to be the admin of, and the word only raises the question
              of who else is in here. */}
          <span className="hidden sm:inline text-xs font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 shrink-0">
            {isIndividual ? (lang === "en" ? "Personal" : "Pribadi") : "Admin"}
          </span>
          {/* The workspace name is the person's own name on an individual
              account, and it is already in the header on the right. */}
          {companyName && !isIndividual && <span className="hidden md:inline text-sm text-gray-400 shrink-0">·</span>}
          {companyName && !isIndividual && <span className="hidden md:inline text-sm font-medium text-gray-600 truncate">{companyName}</span>}
          {/* Every paid plan needs a case here: the fallback is "Free", so a
              plan this list has not heard of shows a paying customer — the
              negotiated Custom ones most of all — as being on the free tier. */}
          <span className={`hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
            plan === "custom" ? "bg-gray-900 text-white border-gray-900" :
            plan === "enterprise" ? "bg-teal-100 text-teal-700 border-teal-200" :
            plan === "professional" ? "bg-teal-100 text-teal-700 border-teal-200" :
            plan === "personal" ? "bg-teal-100 text-teal-700 border-teal-200" :
            "bg-gray-100 text-gray-500 border-gray-200"
          }`}>
            {plan === "custom" ? "★ Custom" : plan === "enterprise" ? "⚡ Enterprise" : plan === "professional" ? "✦ Pro" : plan === "personal" ? "◆ Personal" : "Free"}
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
        <h1 className="text-2xl font-bold mb-4 text-gray-900">{isIndividual ? T.titleIndividual : T.title}</h1>
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
        <OnboardingBanner
          hasDocuments={documents.length > 0}
          hasEmployees={employees.length > 1}
          isIndividual={isIndividual}
          lang={lang}
        />
        <Tabs defaultValue="documents">
          <TabsList className="mb-6 w-full overflow-x-auto flex-nowrap justify-start">
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {isIndividual ? T.tabsIndividual.documents : T.tabs.documents}
            </TabsTrigger>
            {/* Employees and analytics are dropped for an individual account,
                and for different reasons. Employees has nothing behind it — the
                API refuses to create one (requireCompanyAdmin). Analytics works
                perfectly well; it just answers "which of your employees asks the
                most" for a workspace with one member, and the two numbers still
                worth knowing (questions used, documents held) are on the
                Langganan tab already. */}
            {!isIndividual && (
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {T.tabs.users}
              </TabsTrigger>
            )}
            {!isIndividual && (
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4" />
                {T.tabs.analytics}
              </TabsTrigger>
            )}
            <TabsTrigger value="persona" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {isIndividual ? T.tabsIndividual.persona : T.tabs.persona}
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {isIndividual ? T.tabsIndividual.audit : T.tabs.audit}
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {lang === "en" ? "Subscription" : "Langganan"}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="documents">
            <DocumentsTab
              documents={documents}
              onUpload={handleUpload}
              onIndex={handleIndex}
              onReindex={handleReindex}
              onDelete={handleDelete}
              onSetFolder={handleSetFolder}
              showFolders={isIndividual}
              lang={lang}
            />
          </TabsContent>
          {/* The panels come out with their triggers. A TabsContent left mounted
              without one is unreachable by clicking but still rendered by Radix
              when its value is active — and each of these fetches an admin
              endpoint on mount. */}
          {!isIndividual && (
            <TabsContent value="users">
              <UsersTab employees={employees} companyName={companyName} onAddEmployee={handleAddEmployee} lang={lang} />
            </TabsContent>
          )}
          {!isIndividual && (
            <TabsContent value="analytics">
              <AnalyticsTab lang={lang} />
            </TabsContent>
          )}
          <TabsContent value="persona">
            <PersonaTab lang={lang} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditTab isIndividual={isIndividual} lang={lang} />
          </TabsContent>
          <TabsContent value="subscription">
            <SubscriptionTab isIndividual={isIndividual} lang={lang} />
          </TabsContent>
        </Tabs>
        </>
        )}
      </main>
    </div>
  );
}
