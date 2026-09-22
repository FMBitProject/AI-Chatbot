"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { AiProvidersCard } from "./AiProvidersCard";
import Link from "next/link";
import { PLAN_LABELS as SHARED_PLAN_LABELS } from "@/lib/pricing";

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

const PLAN_LABELS: Record<string, string> = { ...SHARED_PLAN_LABELS, starter: "Free Starter" };
const STATUS_LABELS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  paid_review: { label: "Dibayar — perlu pemeriksaan", variant: "secondary" },
  paid: { label: "Lunas", variant: "success" },
  pending: { label: "Menunggu", variant: "warning" },
  failed: { label: "Gagal", variant: "destructive" },
  expired: { label: "Kedaluwarsa", variant: "secondary" },
};

// `isIndividual` removes the seat count from the limits row. Nothing else on
// this tab is team-specific: documents, questions, invoices and BYOK all mean
// the same thing for one person as for fifty.
export function SubscriptionTab({ isIndividual = false, lang = "id" }: { isIndividual?: boolean; lang?: "id" | "en" }) {
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

  // `data === null` cannot tell "still loading" from "the request failed", and
  // the render below reports the second as a permanent "Memuat..." — a lie the
  // reader has no way to see through. Same flag AnalyticsTab and AuditTab use.
  const [failed, setFailed] = useState(false);

  // Bumped on every load. A response whose token no longer matches belongs to a
  // request this component has already replaced — two clicks on "Coba Lagi", and
  // the slower one lands last — and applying it would let a stale answer
  // overwrite a fresher one.
  //
  // No unmount cleanup on purpose: React 18 discards a setState on an unmounted
  // component silently rather than leaking, so invalidating here would buy
  // nothing and only trip the exhaustive-deps rule about reading a ref in a
  // cleanup function.
  const loadTokenRef = useRef(0);

  const load = useCallback(() => {
    const token = ++loadTokenRef.current;
    // `r.ok` before `r.json()`, and a shape check after it. Neither is optional
    // here: an expired session answers 401 with `{ error: "Unauthorized" }`,
    // which is valid JSON, so the old `.catch()` never fired and `setData`
    // stored the error body. `if (!data)` on line below then passed — an object
    // is truthy — and the render reached `data.limits.maxDocuments`, which threw
    // a TypeError and took the whole admin page down to the 500 screen. The real
    // problem was "please sign in again".
    fetch("/api/admin/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SubData | null) => {
        if (token !== loadTokenRef.current) return;
        if (d && d.limits && Array.isArray(d.history)) {
          setData(d);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => { if (token === loadTokenRef.current) setFailed(true); });

  }, []);

  useEffect(() => { load(); }, [load]);

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
      const d = await res.json() as { upgraded?: boolean; status?: string; message?: string; error?: string };

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
      if (d.status === "paid_review") {
        load();
        toast({ title: "Pembayaran perlu pemeriksaan", description: d.message });
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

  if (failed) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-gray-500 mb-3">
          {lang === "en"
            ? "Could not load your subscription. Check your connection, then try again."
            : "Gagal memuat data langganan. Periksa koneksi Anda, lalu coba lagi."}
        </p>
        <Button variant="outline" size="sm" onClick={load}>{lang === "en" ? "Retry" : "Coba Lagi"}</Button>
      </div>
    );
  }
  if (!data) return <div className="text-center py-10 text-gray-400 text-sm">{lang === "en" ? "Loading..." : "Memuat..."}</div>;

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

  // Storing a key is Professional-and-above, but a company that already stored
  // one keeps the right to see and remove it after the plan lapses — it is their
  // credential, and clearing it is the fix if the key stops working upstream.
  // Custom must be included: BYOK is what makes an uncapped plan viable, so the
  // one tier that most needs this field cannot be the one locked out of it.
  //
  // Kept in step with BYOK_PLANS in /api/admin/company by hand. The server is the
  // authority — this only decides whether the field is rendered, and a stale copy
  // here shows a field whose save is refused rather than granting anything.
  const canEditKeys =
    data.plan === "personal" || data.plan === "professional" ||
    data.plan === "enterprise" || data.plan === "custom";


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

      <Card className={data.plan === "custom" ? "border-gray-900" : data.plan === "enterprise" ? "border-violet-300" : data.plan === "professional" ? "border-blue-300" : "border-gray-200"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{lang === "en" ? "Current Plan" : "Paket Aktif"}</CardTitle>
            <Badge variant={data.plan === "starter" ? "secondary" : "default"} className={data.plan === "custom" ? "bg-gray-900" : data.plan === "enterprise" ? "bg-violet-600" : ""}>
              {data.plan === "custom" ? "★" : data.plan === "enterprise" ? "⚡" : data.plan === "professional" ? "✦" : ""} {PLAN_LABELS[data.plan]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {statusLine && (
            <div className={`mb-4 text-sm font-medium ${statusLine.tone}`}>{statusLine.text}</div>
          )}
          <div className={`grid grid-cols-2 ${isIndividual ? "sm:grid-cols-3" : "sm:grid-cols-4"} gap-3 mb-4`}>
            {[
              { label: lang === "en" ? "Documents" : "Dokumen", value: inf(data.limits.maxDocuments) },
              // Dropped for an individual account, and not merely as tidying:
              // maxEmployees comes from the plan, not from the account type, so
              // an individual on the free tier read "5 Karyawan" here — a seat
              // allowance the API refuses to spend (requireCompanyAdmin) on the
              // one tab an individual is most likely to open before paying.
              // Advertising a plan limit we will not honour is worse than
              // showing one number fewer.
              ...(isIndividual ? [] : [{ label: lang === "en" ? "Employees" : "Karyawan", value: inf(data.limits.maxEmployees) }]),
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

      <AiProvidersCard canEdit={canEditKeys} lang={lang} />

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
