"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { pricing } from "@/lib/i18n";
import { CheckCircle2, XCircle, Zap, ArrowRight, MessageSquare, FileText, Users, Shield, BarChart2, Link2, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { SiteFooter } from "@/components/SiteFooter";

const ORIGINAL_PRICES = ["", "Rp 299.000", "Rp 799.000"];
const PROMO_PRICES = ["", "Rp 200.000", "Rp 500.000"];
const FEATURE_ICONS = [MessageSquare, FileText, Users, Shield, BarChart2, Link2];
const HAS_PROMO = [false, true, true];

export default function PricingPage() {
  const { lang } = useLang();
  const T = pricing[lang];
  const { data: session } = authClient.useSession();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  async function handlePay(plan: "professional" | "enterprise") {
    if (!session) { window.location.href = "/register"; return; }
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json() as { token: string };
      if (!data.token) throw new Error("No token");

      // Load Midtrans Snap script dynamically
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

      (window as unknown as { snap: { pay: (token: string, opts: object) => void } }).snap.pay(data.token, {
        onSuccess: () => { window.location.href = `/payment/success?plan=${plan}`; },
        onPending: () => { window.location.href = "/payment/pending"; },
        onError: () => { window.location.href = "/payment/failed"; },
        onClose: () => setLoadingPlan(null),
      });
    } catch {
      setLoadingPlan(null);
      alert("Gagal memulai pembayaran. Silakan coba lagi.");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <LogoFull size="sm" className="shrink-0" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:flex" />
            {mounted && session?.user ? (
              <Link href="/chat">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">
                  {lang === "en" ? "Go to Dashboard" : "Buka Dashboard"}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.signin}</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">{T.startFree}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Promo Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-pink-500 text-white text-center py-2.5 px-4 text-sm font-medium">
        {T.promoBanner} &nbsp;·&nbsp; <span className="underline">{T.promoEnds}</span>
      </div>

      {/* Hero */}
      <section className="text-center py-16 px-6 bg-gradient-to-b from-teal-50 to-white">
        <span className="inline-block bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          {T.badge}
        </span>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">{T.title}</h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">{T.subtitle}</p>
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          {T.plans.map((plan, idx) => (
            <div key={plan.name} className={cn("rounded-2xl border-2 p-8 flex flex-col relative",
              idx === 1 ? "border-teal-500 shadow-teal-100 shadow-xl" : idx === 2 ? "border-teal-700" : "border-gray-200"
            )}>
              {idx === 1 && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-teal-600 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <Zap className="h-3 w-3" />{T.popular}
                  </span>
                </div>
              )}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  {HAS_PROMO[idx] && (
                    <span className="text-xs font-bold bg-orange-100 text-orange-600 border border-orange-200 rounded-full px-2 py-0.5">
                      {T.discountBadge}
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-sm mb-3">{plan.desc}</p>
                {HAS_PROMO[idx] ? (
                  <div>
                    <span className="text-sm text-gray-400 line-through">{ORIGINAL_PRICES[idx]}</span>
                    <div className="flex items-end gap-1 mt-0.5">
                      <span className="text-3xl font-bold text-orange-500">{PROMO_PRICES[idx]}</span>
                      <span className="text-gray-400 text-sm pb-1">/ {T.perMonth}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold text-gray-900">{idx === 0 ? T.free : ORIGINAL_PRICES[idx]}</span>
                    <span className="text-gray-400 text-sm pb-1">/ {idx === 0 ? T.forever : T.perMonth}</span>
                  </div>
                )}
              </div>
              <ul className="space-y-3 flex-1 mb-8">
                {T.features[idx].map((f, fi) => {
                  const checkedCount = idx === 0 ? 5 : T.features[idx].length;
                  const hasCheck = fi < checkedCount;
                  const isGray = fi >= checkedCount;
                  return (
                    <li key={fi} className="flex items-center gap-2.5 text-sm">
                      {hasCheck
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        : <XCircle className="h-4 w-4 text-gray-200 shrink-0" />}
                      <span className={isGray ? "text-gray-300" : "text-gray-700"}>{f}</span>
                    </li>
                  );
                })}
              </ul>
              {idx === 0 ? (
                <Link href="/register">
                  <Button variant="outline" className="w-full gap-2">
                    {T.startFree} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : mounted && session?.user ? (
                <Button
                  className={cn("w-full gap-2", idx === 1 ? "bg-teal-600 hover:bg-teal-700" : "bg-teal-700 hover:bg-teal-800")}
                  onClick={() => handlePay(idx === 1 ? "professional" : "enterprise")}
                  disabled={loadingPlan !== null}
                >
                  {loadingPlan === (idx === 1 ? "professional" : "enterprise")
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</>
                    : <>{idx === 1 ? T.trialFree : T.contactSales} <ArrowRight className="h-4 w-4" /></>
                  }
                </Button>
              ) : (
                <Link href={`/register?plan=${idx === 1 ? "professional" : "enterprise"}`}>
                  <Button className={cn("w-full gap-2", idx === 1 ? "bg-teal-600 hover:bg-teal-700" : "bg-teal-700 hover:bg-teal-800")}>
                    {idx === 1 ? T.trialFree : T.contactSales} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Fair use footnote */}
      <div className="max-w-6xl mx-auto px-6 pb-6 flex items-start gap-1.5">
        {T.fairUseNote && <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />}
        {T.fairUseNote && <p className="text-xs text-gray-400">{T.fairUseNote}</p>}
      </div>

      {/* Feature grid */}
      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-5xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{T.allFeatures}</h2>
          <p className="text-gray-500">{T.allFeaturesDesc}</p>
        </div>
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {T.featureGrid.map((f, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <div key={i} className="bg-white rounded-xl p-6 border">
                <div className="p-2 bg-teal-50 rounded-lg w-fit mb-3">
                  <Icon className="h-5 w-5 text-teal-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">{T.faqTitle}</h2>
        <div className="space-y-6">
          {T.faqs.map((faq) => (
            <div key={faq.q} className="border-b pb-6">
              <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-700 to-[#061C24] py-16 px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-3">{T.ctaTitle}</h2>
        <p className="text-teal-100 mb-8">{T.ctaDesc}</p>
        <Link href="/register">
          <Button size="lg" className="bg-white text-teal-600 hover:bg-teal-50 gap-2 font-semibold">
            {T.ctaBtn} <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
