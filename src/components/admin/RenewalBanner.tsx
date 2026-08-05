"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Status = "active" | "expiring" | "grace" | "expired";

// Warns the admin before the subscription lapses (from RENEWAL_WARNING_DAYS out)
// and keeps warning during the grace period and after the downgrade. Deliberately
// not dismissible for grace/expired — those states cost the company features.
export function RenewalBanner({ lang = "id" }: { lang?: "id" | "en" }) {
  const [sub, setSub] = useState<{
    status: Status;
    purchasedPlan?: string;
    planExpiresAt?: string | null;
    graceEndsAt?: string | null;
    daysUntilExpiry?: number | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/subscription")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.status) setSub(d); })
      .catch(() => {});
  }, []);

  if (!sub || sub.status === "active") return null;

  const fmt = (d?: string | null) => d
    ? new Date(d).toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "";

  // A Custom account normally has no expiry, so this banner never fires for it
  // — but it can be given one by hand, and an empty label would render "Paket
  //  Anda berakhir" with a hole where the plan name belongs.
  const planLabel = sub.purchasedPlan === "custom" ? "Custom"
    : sub.purchasedPlan === "enterprise" ? "Enterprise"
    : sub.purchasedPlan === "professional" ? "Professional" : "";

  const copy = {
    expiring: {
      icon: Clock,
      style: "bg-amber-50 border-amber-200 text-amber-900",
      title: lang === "en"
        ? `Your ${planLabel} plan expires in ${sub.daysUntilExpiry} day(s)`
        : `Paket ${planLabel} Anda berakhir dalam ${sub.daysUntilExpiry} hari`,
      body: lang === "en"
        ? `Renew before ${fmt(sub.planExpiresAt)} so nothing is interrupted.`
        : `Perpanjang sebelum ${fmt(sub.planExpiresAt)} agar layanan tidak terganggu.`,
    },
    grace: {
      icon: AlertTriangle,
      style: "bg-amber-50 border-amber-300 text-amber-900",
      title: lang === "en"
        ? `Your ${planLabel} plan expired on ${fmt(sub.planExpiresAt)}`
        : `Paket ${planLabel} Anda berakhir pada ${fmt(sub.planExpiresAt)}`,
      body: lang === "en"
        ? `You are in the grace period until ${fmt(sub.graceEndsAt)}. After that the account drops to Free Starter: documents and employees above the free limits stop working until you renew.`
        : `Anda dalam masa tenggang sampai ${fmt(sub.graceEndsAt)}. Setelah itu akun turun ke Free Starter: dokumen dan karyawan di atas batas gratis berhenti berfungsi sampai Anda perpanjang.`,
    },
    expired: {
      icon: AlertTriangle,
      style: "bg-red-50 border-red-200 text-red-900",
      title: lang === "en" ? "Your subscription has ended" : "Langganan Anda sudah berakhir",
      body: lang === "en"
        ? "The account is on Free Starter. Your documents and employees are kept safe — those above the free limits become active again as soon as you renew."
        : "Akun sekarang di paket Free Starter. Dokumen dan karyawan Anda tetap tersimpan — yang melebihi batas gratis akan aktif kembali begitu Anda perpanjang.",
    },
  }[sub.status];

  const Icon = copy.icon;

  return (
    <div className={`mb-6 rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 ${copy.style}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{copy.title}</p>
        <p className="text-sm opacity-90 mt-0.5">{copy.body}</p>
      </div>
      <Link href="/pricing" className="shrink-0">
        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
          {lang === "en" ? "Renew now" : "Perpanjang Sekarang"} <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}
