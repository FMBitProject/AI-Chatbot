"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Link2, CheckCircle2, Loader2 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { Plan } from "@/lib/plan-limits";

interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  installedAt: string | null;
}

// Slack is sold on Professional and Enterprise (see src/lib/i18n.ts's plan
// feature lists). /api/slack/install already refuses a Starter admin server
// side; this is only so a Starter admin sees the upgrade message before
// clicking through to Slack's consent screen instead of after.
const PAID_PLANS: Plan[] = ["personal", "professional", "enterprise", "custom"];

export function SlackTab({ lang = "id", plan }: { lang?: Lang; plan: Plan }) {
  const router = useRouter();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const canUseSlack = PAID_PLANS.includes(plan);

  // Checks r.ok before r.json(), which the TODO that used to sit here did not.
  // The failure it describes was worse than "silently renders as not
  // connected": an expired session answers 401 with `{ error: "Unauthorized" }`,
  // which parses fine, so `.catch()` never ran and `status.connected` read
  // `undefined` off the error body. A workspace that *is* connected then
  // rendered the "Tambahkan ke Slack" button, and an admin following it would
  // reinstall an integration that was never broken.
  //
  // `failed` is separate from `status === null` because that alone cannot tell
  // "still loading" from "the request failed", and the render reports the
  // second as a spinner that never stops.
  const loadStatus = useCallback(() => {
    fetch("/api/admin/slack")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SlackStatus | null) => {
        if (d && typeof d.connected === "boolean") {
          setStatus(d);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Picks up the redirect from /api/slack/oauth/callback (?slack=connected |
  // denied | error) once on mount, then strips the param so a refresh does not
  // re-fire the toast. Read from window.location directly rather than
  // next/navigation's useSearchParams: that hook forces this whole page onto
  // client-side rendering behind a Suspense boundary at build time, which is
  // more than a one-time redirect flag needs.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("slack");
    if (!result) return;

    if (result === "connected") {
      toast({ title: lang === "en" ? "Slack connected." : "Slack berhasil terhubung." });
      loadStatus();
    } else if (result === "denied") {
      toast({ title: lang === "en" ? "Slack installation cancelled." : "Pemasangan Slack dibatalkan." });
    } else if (result === "taken") {
      toast({
        variant: "destructive",
        title: lang === "en" ? "That Slack workspace is already connected to another account." : "Workspace Slack itu sudah terhubung ke akun lain.",
      });
    } else if (result === "plan") {
      toast({
        variant: "destructive",
        title: lang === "en" ? "Slack integration is available on paid plans." : "Integrasi Slack tersedia mulai paket berbayar.",
      });
    } else {
      toast({ variant: "destructive", title: lang === "en" ? "Failed to connect Slack. Please try again." : "Gagal menghubungkan Slack. Silakan coba lagi." });
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("slack");
    router.replace(`${url.pathname}${url.search}`);
    // Only ever meant to run once against the param this page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      // fetch() only rejects on a network-level failure, not on a non-2xx
      // response — an expired session (403) or a transient 500 would
      // otherwise fall straight through to the success branch below and tell
      // the admin Slack was disconnected when the row is still there.
      const res = await fetch("/api/admin/slack", { method: "DELETE" });
      if (!res.ok) throw new Error(`Disconnect failed with status ${res.status}`);
      setStatus({ connected: false, teamName: null, installedAt: null });
      toast({ title: lang === "en" ? "Slack disconnected." : "Slack diputuskan." });
    } catch {
      toast({ variant: "destructive", title: lang === "en" ? "Failed to disconnect Slack." : "Gagal memutuskan Slack." });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">{lang === "en" ? "Slack Integration" : "Integrasi Slack"}</h2>
        <p className="text-sm text-gray-500">
          {lang === "en"
            ? "Let employees ask IntelliBase questions directly from Slack, with /tanya or by mentioning the bot."
            : "Biarkan karyawan bertanya ke IntelliBase langsung dari Slack, lewat /tanya atau dengan mention bot."}
        </p>
      </div>

      {!canUseSlack ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-700">
              {lang === "en"
                ? "🔒 Slack integration is available on paid plans. Upgrade to connect your workspace."
                : "🔒 Integrasi Slack tersedia mulai paket berbayar. Upgrade paket untuk menghubungkan workspace Anda."}
            </p>
          </CardContent>
        </Card>
      ) : failed ? (
        // Before the "Add to Slack" button, deliberately. A failed read cannot
        // tell us whether this workspace is connected, and guessing "not
        // connected" is the guess that costs something: it invites an admin to
        // reinstall an integration that may be working perfectly.
        <div className="text-sm">
          <p className="text-gray-500 mb-3">
            {lang === "en"
              ? "Could not read the Slack connection status. Check your connection, then try again."
              : "Gagal membaca status koneksi Slack. Periksa koneksi Anda, lalu coba lagi."}
          </p>
          <Button variant="outline" size="sm" onClick={loadStatus}>{lang === "en" ? "Retry" : "Coba Lagi"}</Button>
        </div>
      ) : status === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> {lang === "en" ? "Loading…" : "Memuat…"}
        </div>
      ) : status.connected ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {lang === "en" ? "Connected to" : "Terhubung ke"} {status.teamName ?? (lang === "en" ? "your workspace" : "workspace Anda")}
                  </p>
                  {status.installedAt && (
                    <p className="text-xs text-green-600 mt-0.5">
                      {lang === "en" ? "Since" : "Sejak"} {new Date(status.installedAt).toLocaleDateString(lang === "en" ? "en-US" : "id-ID")}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "en" ? "Disconnect" : "Putuskan")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <a href="/api/slack/install">
            <Link2 className="h-4 w-4" /> {lang === "en" ? "Add to Slack" : "Tambahkan ke Slack"}
          </a>
        </Button>
      )}

      <div className="rounded-xl border p-4 bg-gray-50 text-xs space-y-1.5 text-gray-600">
        <p className="font-semibold text-gray-700">{lang === "en" ? "How it works" : "Cara kerja"}</p>
        <p>{lang === "en"
          ? "After connecting, an employee whose Slack profile email matches their IntelliBase account can type /tanya <question> or mention the bot in any channel it's invited to."
          : "Setelah terhubung, karyawan yang email profil Slack-nya sama dengan akun IntelliBase mereka bisa mengetik /tanya <pertanyaan> atau mention bot di channel manapun ia diundang."}</p>
      </div>
    </div>
  );
}
