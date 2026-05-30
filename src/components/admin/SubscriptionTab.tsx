"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, QrCode } from "lucide-react";
import Link from "next/link";

interface SubData {
  plan: string;
  limits: { maxDocuments: number; maxEmployees: number; maxQuestionsPerMonth: number };
  history: { id: string; orderId: string; plan: string; amount: string; status: string; snapToken?: string | null; createdAt: string; paidAt?: string | null }[];
}

const PLAN_LABELS: Record<string, string> = { starter: "Free Starter", professional: "Professional", enterprise: "Enterprise" };
const STATUS_LABELS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  paid: { label: "Lunas", variant: "success" },
  pending: { label: "Menunggu", variant: "warning" },
  failed: { label: "Gagal", variant: "destructive" },
  expired: { label: "Kedaluwarsa", variant: "secondary" },
};

export function SubscriptionTab({ lang = "id" }: { lang?: "id" | "en" }) {
  const [data, setData] = useState<SubData | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/subscription").then((r) => r.json()).then((d: SubData) => setData(d)).catch(() => {});
  }, []);

  async function handleResume(snapToken: string, plan: string) {
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
      (window as unknown as { snap: { pay: (token: string, opts: object) => void } }).snap.pay(snapToken, {
        onSuccess: () => { window.location.href = `/payment/success?plan=${plan}`; },
        onPending: () => { window.location.reload(); },
        onError: () => { window.location.href = "/payment/failed"; },
        onClose: () => setResuming(null),
      });
    } catch {
      setResuming(null);
    }
  }

  if (!data) return <div className="text-center py-10 text-gray-400 text-sm">Memuat...</div>;

  const inf = (v: number) => v === Infinity ? (lang === "en" ? "Unlimited" : "Tidak terbatas") : v;

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
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label: lang === "en" ? "Documents" : "Dokumen", value: inf(data.limits.maxDocuments) },
              { label: lang === "en" ? "Employees" : "Karyawan", value: inf(data.limits.maxEmployees) },
              { label: lang === "en" ? "Questions/month" : "Pertanyaan/bulan", value: inf(data.limits.maxQuestionsPerMonth) },
            ].map((l) => (
              <div key={l.label} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-lg font-bold text-gray-900">{String(l.value)}</p>
                <p className="text-xs text-gray-500">{l.label}</p>
              </div>
            ))}
          </div>
          {data.plan === "starter" && (
            <Link href="/pricing">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                {lang === "en" ? "Upgrade Plan" : "Upgrade Paket"} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

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
                    {tx.status === "pending" && tx.snapToken && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => handleResume(tx.snapToken!, tx.plan)}
                        disabled={resuming === tx.snapToken}
                      >
                        {resuming === tx.snapToken
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <QrCode className="h-3 w-3" />}
                        {lang === "en" ? "Continue Payment" : "Lanjutkan Bayar"}
                      </Button>
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
