"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, QrCode, RefreshCw, Key, CheckCircle2, Eye, EyeOff, Trash2, ExternalLink } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface SubData {
  // plan = what applies right now; purchasedPlan = what was last paid for.
  plan: string;
  purchasedPlan?: string;
  status?: "active" | "expiring" | "grace" | "expired";
  planExpiresAt?: string | null;
  graceEndsAt?: string | null;
  daysUntilExpiry?: number | null;
  limits: { maxDocuments: number; maxEmployees: number; maxQuestionsPerMonth: number; maxQuestionsPerDay: number };
  history: { id: string; orderId: string; plan: string; amount: string; status: string; snapToken?: string | null; createdAt: string; paidAt?: string | null }[];
}

const PLAN_LABELS: Record<string, string> = { starter: "Free Starter", professional: "Professional", enterprise: "Enterprise" };
const STATUS_LABELS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  paid: { label: "Lunas", variant: "success" },
  pending: { label: "Menunggu", variant: "warning" },
  failed: { label: "Gagal", variant: "destructive" },
  expired: { label: "Kedaluwarsa", variant: "secondary" },
};

interface ByokState {
  hasGroqKey: boolean;
  hasGeminiKey: boolean;
  groqInput: string;
  geminiInput: string;
  showGroq: boolean;
  showGemini: boolean;
  saving: boolean;
}

export function SubscriptionTab({ lang = "id" }: { lang?: "id" | "en" }) {
  const [data, setData] = useState<SubData | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);
  // Order ids currently being checked. A single boolean disabled every row's
  // "Cek Status" at once; a single id let whichever check finished first
  // re-enable a row whose request was still running.
  const [verifying, setVerifying] = useState<string[]>([]);
  // The same set, kept in a ref so a second click can be rejected before React
  // has re-rendered the disabled button. State alone would let a fast double
  // click start two requests and push two entries, and the first one to finish
  // would then remove both. Created on first use rather than passed to useRef,
  // which would allocate a Set on every render just to throw it away.
  const inFlightRef = useRef<Set<string> | null>(null);
  const [byok, setByok] = useState<ByokState>({
    hasGroqKey: false, hasGeminiKey: false,
    groqInput: "", geminiInput: "",
    showGroq: false, showGemini: false, saving: false,
  });

  useEffect(() => {
    fetch("/api/admin/subscription").then((r) => r.json()).then((d: SubData) => setData(d)).catch(() => {});
    fetch("/api/admin/company").then((r) => r.json()).then((d: { hasGroqKey: boolean; hasGeminiKey: boolean }) => {
      if (d) setByok((p) => ({ ...p, hasGroqKey: !!d.hasGroqKey, hasGeminiKey: !!d.hasGeminiKey }));
    }).catch(() => {});
  }, []);

  async function saveByokKey(provider: "groq" | "gemini", value: string | null) {
    setByok((p) => ({ ...p, saving: true }));
    try {
      const res = await fetch("/api/admin/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider === "groq" ? { groqApiKey: value } : { geminiApiKey: value }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        toast({ variant: "destructive", title: "Gagal", description: err.error });
        return;
      }
      const updated = await res.json() as { hasGroqKey: boolean; hasGeminiKey: boolean };
      setByok((p) => ({
        ...p,
        hasGroqKey: updated.hasGroqKey, hasGeminiKey: updated.hasGeminiKey,
        groqInput: provider === "groq" ? "" : p.groqInput,
        geminiInput: provider === "gemini" ? "" : p.geminiInput,
      }));
      const label = provider === "groq" ? "Groq" : "Gemini";
      toast({ title: value ? `${label} API Key disimpan.` : `${label} API Key dihapus.` });
    } finally {
      setByok((p) => ({ ...p, saving: false }));
    }
  }

  async function handleResume(snapToken: string, plan: string, orderId: string) {
    setResuming(snapToken);
    try {
      const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
      if (!document.getElementById("midtrans-snap")) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.id = "midtrans-snap";
          script.src = process.env.NEXT_PUBLIC_MIDTRANS_ENV === "production"
            ? "https://app.midtrans.com/snap/snap.js"
            : "https://app.sandbox.midtrans.com/snap/snap.js";
          script.setAttribute("data-client-key", clientKey);
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }
      // We are resuming one specific order, so name it on the success page
      // instead of letting the server fall back to "newest for this plan".
      (window as unknown as { snap: { pay: (token: string, opts: object) => void } }).snap.pay(snapToken, {
        onSuccess: () => {
          window.location.href = `/payment/success?plan=${plan}&orderId=${encodeURIComponent(orderId)}`;
        },
        onPending: () => { window.location.reload(); },
        onError: () => { window.location.href = "/payment/failed"; },
        onClose: () => setResuming(null),
      });
    } catch {
      setResuming(null);
    }
  }

  async function handleVerify(plan: string, orderId: string) {
    const inFlight = (inFlightRef.current ??= new Set<string>());
    if (inFlight.has(orderId)) return;
    inFlight.add(orderId);
    setVerifying((ids) => [...ids, orderId]);
    try {
      // Send the order id, not just the plan: this button belongs to one row of
      // the history, and the answer has to be about that order.
      const res = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, orderId }),
      });
      const d = await res.json() as { upgraded?: boolean; status?: string; error?: string };

      // Every failure used to look identical to "not paid yet": the button just
      // stopped spinning and nothing happened. Say what actually went wrong,
      // otherwise a throttled or failing check reads as an unpaid invoice.
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: res.status === 429 ? "Terlalu sering" : "Gagal memeriksa status",
          description: d.error ?? "Coba lagi beberapa saat lagi.",
        });
        return;
      }
      if (d.upgraded) {
        window.location.reload();
        return;
      }
      toast({
        title: "Pembayaran belum selesai",
        description: d.status === "pending"
          ? "Pembayaran masih menunggu penyelesaian di Midtrans."
          : "Belum ada pembayaran yang berhasil untuk pesanan ini.",
      });
    } catch {
      // Covers both a failed request and a response we could not read, so don't
      // pin the blame on the user's connection — it may well be our error page.
      toast({
        variant: "destructive",
        title: "Gagal memeriksa status",
        description: "Permintaan tidak dapat diselesaikan. Coba lagi beberapa saat lagi.",
      });
    }
    finally {
      inFlight.delete(orderId);
      setVerifying((ids) => ids.filter((id) => id !== orderId));
    }
  }

  if (!data) return <div className="text-center py-10 text-gray-400 text-sm">Memuat...</div>;

  const inf = (v: number | null | undefined) => {
    if (v === null || v === undefined || v < 0) return lang === "en" ? "Unlimited" : "∞ Tak Terbatas";
    return v;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "long", year: "numeric" });

  const status = data.status ?? "active";
  const expiryStr = data.planExpiresAt ? fmtDate(data.planExpiresAt) : null;
  const graceStr = data.graceEndsAt ? fmtDate(data.graceEndsAt) : null;
  const purchasedLabel = PLAN_LABELS[data.purchasedPlan ?? data.plan] ?? data.plan;

  // Storing a key is Enterprise-only, but a company that already stored one
  // keeps the right to see and remove it after the plan lapses — it is their
  // credential, and clearing it is the fix if the key stops working upstream.
  const canEditKeys = data.plan === "enterprise";
  const hasAnyKey = byok.hasGroqKey || byok.hasGeminiKey;

  // One line that always says where the subscription stands, including the two
  // states the plan badge alone cannot show: grace period and lapsed.
  const statusLine = !expiryStr ? null
    : status === "expired"
      ? { tone: "text-red-600", text: lang === "en"
          ? `${purchasedLabel} ended on ${expiryStr} — you are now on Free Starter.`
          : `${purchasedLabel} berakhir pada ${expiryStr} — paket Anda sekarang Free Starter.` }
    : status === "grace"
      ? { tone: "text-amber-600", text: lang === "en"
          ? `Expired on ${expiryStr}. Grace period until ${graceStr} — renew to keep your ${purchasedLabel} limits.`
          : `Kedaluwarsa pada ${expiryStr}. Masa tenggang sampai ${graceStr} — perpanjang agar batas ${purchasedLabel} tidak hilang.` }
    : status === "expiring"
      ? { tone: "text-amber-600", text: lang === "en"
          ? `Active until ${expiryStr} (${data.daysUntilExpiry} day(s) left)`
          : `Aktif sampai ${expiryStr} (${data.daysUntilExpiry} hari lagi)` }
      : { tone: "text-gray-600", text: lang === "en" ? `Active until ${expiryStr}` : `Aktif sampai ${expiryStr}` };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">{lang === "en" ? "Subscription" : "Langganan"}</h2>
        <p className="text-sm text-gray-500">{lang === "en" ? "Your current plan and billing history." : "Paket aktif dan riwayat pembayaran Anda."}</p>
      </div>

      <Card className={data.plan === "enterprise" ? "border-violet-300" : data.plan === "professional" ? "border-blue-300" : "border-gray-200"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{lang === "en" ? "Current Plan" : "Paket Aktif"}</CardTitle>
            <Badge variant={data.plan === "starter" ? "secondary" : "default"} className={data.plan === "enterprise" ? "bg-violet-600" : ""}>
              {data.plan === "enterprise" ? "⚡" : data.plan === "professional" ? "✦" : ""} {PLAN_LABELS[data.plan]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {statusLine && (
            <div className={`mb-4 text-sm font-medium ${statusLine.tone}`}>{statusLine.text}</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: lang === "en" ? "Documents" : "Dokumen", value: inf(data.limits.maxDocuments) },
              { label: lang === "en" ? "Employees" : "Karyawan", value: inf(data.limits.maxEmployees) },
              { label: lang === "en" ? "Questions/day" : "Pertanyaan/hari", value: inf(data.limits.maxQuestionsPerDay) },
              { label: lang === "en" ? "Questions/month" : "Pertanyaan/bulan", value: inf(data.limits.maxQuestionsPerMonth) },
            ].map((l) => (
              <div key={l.label} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-900">{String(l.value)}</p>
                <p className="text-xs text-gray-500">{l.label}</p>
              </div>
            ))}
          </div>
          {data.plan === "starter" ? (
            <Link href="/pricing">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                {lang === "en" ? "Upgrade Plan" : "Upgrade Paket"} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link href="/pricing">
              <Button variant="outline" className="w-full gap-2">
                {lang === "en" ? "View all plans & pricing" : "Lihat semua paket & harga"} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* BYOK — configurable on Enterprise; visible + removable whenever a key exists */}
      {(canEditKeys || hasAnyKey) && (
        <Card className="border-violet-200">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-violet-100 rounded-lg"><Key className="h-4 w-4 text-violet-600" /></div>
              <div>
                <CardTitle className="text-base">
                  {lang === "en" ? "Dedicated AI Capacity" : "Kapasitas AI Dedicated"}
                </CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {canEditKeys
                    ? (lang === "en"
                      ? "Connect your own Groq & Gemini API keys for isolated, unlimited capacity."
                      : "Hubungkan API key Groq & Gemini Anda sendiri untuk kapasitas terisolasi dan tidak terbatas.")
                    : (lang === "en"
                      ? "Your stored key is still used to answer questions. Adding or replacing a key requires Enterprise — removing one is always yours to do."
                      : "Key Anda yang tersimpan masih dipakai untuk menjawab pertanyaan. Menambah atau mengganti key hanya di paket Enterprise — menghapus selalu bisa Anda lakukan.")}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["groq", "gemini"] as const)
              // Without edit rights there is nothing to show for a provider
              // whose key was never set.
              .filter((provider) => canEditKeys || (provider === "groq" ? byok.hasGroqKey : byok.hasGeminiKey))
              .map((provider) => {
              const isGroq = provider === "groq";
              const hasKey = isGroq ? byok.hasGroqKey : byok.hasGeminiKey;
              const input = isGroq ? byok.groqInput : byok.geminiInput;
              const show = isGroq ? byok.showGroq : byok.showGemini;
              const href = isGroq ? "https://console.groq.com/keys" : "https://aistudio.google.com/apikey";
              const placeholder = isGroq ? "gsk_..." : "AIza...";
              const label = isGroq ? "Groq" : "Gemini";
              return (
                <div key={provider} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{label} API Key</span>
                      {hasKey && (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" />{lang === "en" ? "Active" : "Aktif"}
                        </span>
                      )}
                    </div>
                    {canEditKeys && (
                      <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        {lang === "en" ? "Get key" : "Dapatkan key"} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {canEditKeys ? (
                      <>
                        <div className="relative flex-1">
                          <Input
                            type={show ? "text" : "password"}
                            placeholder={hasKey ? (lang === "en" ? "Enter new key to replace…" : "Masukkan key baru untuk mengganti…") : placeholder}
                            value={input}
                            onChange={(e) => setByok((p) => ({ ...p, [`${provider}Input`]: e.target.value }))}
                            className="pr-10 text-sm font-mono"
                          />
                          <button type="button"
                            onClick={() => setByok((p) => ({ ...p, [isGroq ? "showGroq" : "showGemini"]: !show }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button size="sm" disabled={!input || byok.saving} onClick={() => saveByokKey(provider, input)}
                          className="bg-violet-600 hover:bg-violet-700 shrink-0">
                          {byok.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (lang === "en" ? "Save" : "Simpan")}
                        </Button>
                      </>
                    ) : (
                      <p className="flex-1 self-center text-xs text-gray-500">
                        {lang === "en"
                          ? "Stored and in use. Remove it to fall back to the platform's shared capacity."
                          : "Tersimpan dan sedang dipakai. Hapus untuk kembali memakai kapasitas bersama platform."}
                      </p>
                    )}
                    {hasKey && (
                      <Button size="sm" variant="outline" disabled={byok.saving} onClick={() => saveByokKey(provider, null)}
                        className="text-red-500 border-red-200 hover:bg-red-50 shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 pt-1">
              {canEditKeys
                ? (lang === "en"
                  ? "Keys are stored securely and never shown again. If not set, platform shared capacity is used."
                  : "Key disimpan secara aman dan tidak pernah ditampilkan kembali. Jika tidak diisi, kapasitas platform yang digunakan.")
                : (lang === "en"
                  ? "Upgrade to Enterprise to add or replace keys again."
                  : "Upgrade ke Enterprise untuk menambah atau mengganti key lagi.")}
            </p>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">{lang === "en" ? "Billing History" : "Riwayat Pembayaran"}</h3>
        {data.history.length === 0 ? (
          <p className="text-sm text-gray-400">{lang === "en" ? "No payment history yet." : "Belum ada riwayat pembayaran."}</p>
        ) : (
          <div className="space-y-2">
            {data.history.map((tx) => {
              const s = STATUS_LABELS[tx.status] ?? { label: tx.status, variant: "secondary" as const };
              return (
                <div key={tx.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{PLAN_LABELS[tx.plan]} — Rp {parseInt(tx.amount).toLocaleString("id-ID")}</p>
                    <p className="text-xs text-gray-400">{tx.orderId} · {new Date(tx.createdAt).toLocaleDateString("id-ID")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {tx.status === "pending" && (
                      <div className="flex gap-1.5">
                        {tx.snapToken && (
                          <Button size="sm" variant="outline" className="text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => handleResume(tx.snapToken!, tx.plan, tx.orderId)} disabled={resuming === tx.snapToken}>
                            {resuming === tx.snapToken ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
                            {lang === "en" ? "Pay" : "Bayar"}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-xs gap-1.5 text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => handleVerify(tx.plan, tx.orderId)} disabled={verifying.includes(tx.orderId)}>
                          {verifying.includes(tx.orderId) ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          {lang === "en" ? "Check" : "Cek Status"}
                        </Button>
                      </div>
                    )}
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
