"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/lib/language-context";
import { getPlanPrice, formatRupiah, type PurchasablePlan } from "@/lib/pricing";
import { consultationMailto } from "@/lib/contact";
import { ROI_DEFAULTS, calculateRoi, ESTIMATE_NOTE, SEARCH_TIME_REDUCTION_LABEL } from "@/lib/roi";
import { ArrowRight, Users, Clock, TrendingDown, TrendingUp, Calculator, Zap, Shield, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

const CONTENT = {
  id: {
    nav: { price: "Harga", login: "Masuk", start: "Mulai Gratis" },
    badge: "Kalkulator ROI",
    title: "Berapa Banyak Waktu & Uang yang Terbuang?",
    subtitle: "Hitung estimasi kerugian perusahaan Anda akibat karyawan yang menghabiskan waktu mencari informasi internal secara manual.",
    inputsTitle: "Data Perusahaan Anda",
    inputs: {
      employees: "Jumlah Karyawan",
      employeesDesc: "Total karyawan yang rutin mencari dokumen internal",
      questionsPerDay: "Pertanyaan Internal per Karyawan per Hari",
      questionsDesc: "Rata-rata berapa kali karyawan mencari info SOP, HR, IT, dll.",
      minutesPerSearch: "Waktu Pencarian Manual (menit)",
      minutesDesc: "Rata-rata waktu yang dihabiskan per pencarian tanpa AI",
      salaryPerMonth: "Rata-rata Gaji Karyawan (Rp/bulan)",
      salaryDesc: "Digunakan untuk menghitung biaya waktu yang hilang",
      workingDays: "Hari Kerja per Bulan",
    },
    lossCard: {
      title: "Kerugian Bulanan Tanpa IntelliBase",
      hoursLost: "Total Jam Terbuang / Bulan",
      costLost: "Biaya Waktu Terbuang / Bulan",
      hoursUnit: "jam",
    },
    compTitle: "Pilih Paket yang Tepat untuk Anda",
    compDesc: "Bandingkan ROI kedua paket berdasarkan data perusahaan Anda",
    plans: [
      {
        key: "professional",
        name: "Professional",
        price: 200_000,
        priceLabel: "Rp 200.000 / bulan",
        limit: "Hingga 50 karyawan · 100 dokumen",
        employeeLimit: 50,
        color: "blue",
        cta: "Mulai Professional",
        ctaHref: "/register?plan=professional",
        recommendedLabel: "Cocok untuk Tim Anda",
        overLimitLabel: "Melebihi Batas",
        overLimitDesc: "Plan ini hanya untuk maks. 50 karyawan. Upgrade ke Enterprise.",
        overLimitCta: "Lihat Enterprise →",
        overLimitHref: "/pricing",
        // Only used by the "custom" mode below, where the card stops being this
        // plan and starts being the negotiated one. Empty means "keep my name".
        overLimitName: "",
        // "upgrade" = there is a bigger plan on the shelf, so this card is a
        // dead end and says so. "custom" = they are past everything that has a
        // list price, which is not a dead end at all — see PlanResultCard.
        overLimitMode: "upgrade",
      },
      {
        key: "enterprise",
        name: "Enterprise",
        price: 500_000,
        priceLabel: "Rp 500.000 / bulan",
        limit: "Hingga 200 karyawan · 500 dokumen",
        employeeLimit: 200,
        color: "violet",
        cta: "Mulai Enterprise",
        ctaHref: "/register?plan=enterprise",
        recommendedLabel: "Cocok untuk Tim Anda",
        overLimitLabel: "Perlu Paket Custom",
        overLimitDesc: "Di atas 200 karyawan, paket disusun bersama sesuai skala organisasi Anda.",
        overLimitCta: "Hubungi Kami →",
        overLimitHref: "",
        overLimitName: "Custom",
        overLimitMode: "custom",
      },
    ],
    results: {
      savingsAI: `Penghematan AI (${SEARCH_TIME_REDUCTION_LABEL})`,
      subscription: "Biaya Langganan",
      netSaving: "Hemat Bersih / Bulan",
      roi: "ROI",
      payback: "Balik Modal",
      paybackUnit: "hari",
      // Shown wherever a number depends on a price that does not exist yet.
      // "-" already means "not applicable" on the dead card, so this deliberately
      // reads as pending rather than as zero.
      pending: "disusun bersama",
      pendingShort: "—",
    },
    cta: {
      title: "Siap Mulai Menghemat?",
      desc: "Mulai gratis, setup 10 menit, tidak perlu kartu kredit.",
      // The headline number above this line stops being "net savings" once the
      // organisation is past every listed price — there is nothing to subtract.
      descCustom: "Itu penghematan kotor tim Anda per bulan. Biaya paketnya kita tentukan bersama setelah bicara.",
      btn: "Coba Gratis Dulu",
      pricing: "Lihat Detail Harga",
      contact: "Hubungi Kami",
    },
  },
  en: {
    nav: { price: "Pricing", login: "Sign In", start: "Start Free" },
    badge: "ROI Calculator",
    title: "How Much Time & Money Is Being Wasted?",
    subtitle: "Calculate your company's estimated losses from employees spending time manually searching for internal information.",
    inputsTitle: "Your Company Data",
    inputs: {
      employees: "Number of Employees",
      employeesDesc: "Total employees who regularly search internal documents",
      questionsPerDay: "Internal Questions per Employee per Day",
      questionsDesc: "Average times an employee searches for SOP, HR, IT info, etc.",
      minutesPerSearch: "Manual Search Time (minutes)",
      minutesDesc: "Average time spent per search without AI",
      salaryPerMonth: "Average Employee Salary (Rp/month)",
      salaryDesc: "Used to calculate the cost of lost time",
      workingDays: "Working Days per Month",
    },
    lossCard: {
      title: "Monthly Loss Without IntelliBase",
      hoursLost: "Total Hours Wasted / Month",
      costLost: "Cost of Wasted Time / Month",
      hoursUnit: "hours",
    },
    compTitle: "Choose the Right Plan for You",
    compDesc: "Compare ROI for both plans based on your company data",
    plans: [
      {
        key: "professional",
        name: "Professional",
        price: 200_000,
        priceLabel: "Rp 200,000 / month",
        limit: "Up to 50 employees · 100 documents",
        employeeLimit: 50,
        color: "blue",
        cta: "Start Professional",
        ctaHref: "/register?plan=professional",
        recommendedLabel: "Right for Your Team",
        overLimitLabel: "Over Limit",
        overLimitDesc: "This plan supports max. 50 employees. Upgrade to Enterprise.",
        overLimitCta: "See Enterprise →",
        overLimitHref: "/pricing",
        overLimitName: "",
        overLimitMode: "upgrade",
      },
      {
        key: "enterprise",
        name: "Enterprise",
        price: 500_000,
        priceLabel: "Rp 500,000 / month",
        limit: "Up to 200 employees · 500 documents",
        employeeLimit: 200,
        color: "violet",
        cta: "Start Enterprise",
        ctaHref: "/register?plan=enterprise",
        recommendedLabel: "Right for Your Team",
        overLimitLabel: "Custom Plan Needed",
        overLimitDesc: "Above 200 employees the plan is put together with you, sized to your organisation.",
        overLimitCta: "Contact Us →",
        overLimitHref: "",
        overLimitName: "Custom",
        overLimitMode: "custom",
      },
    ],
    results: {
      savingsAI: `AI Savings (${SEARCH_TIME_REDUCTION_LABEL})`,
      subscription: "Subscription Cost",
      netSaving: "Net Savings / Month",
      roi: "ROI",
      payback: "Payback",
      paybackUnit: "days",
      pending: "agreed with you",
      pendingShort: "—",
    },
    cta: {
      title: "Ready to Start Saving?",
      desc: "Start free, 10-minute setup, no credit card required.",
      descCustom: "That is your team's gross monthly saving. What the plan costs is something we work out together.",
      btn: "Try Free First",
      pricing: "View Full Pricing",
      contact: "Contact Us",
    },
  },
};

function formatRp(value: number): string {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} jt`;
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(0)}rb`;
  return `Rp ${value.toFixed(0)}`;
}

function SliderInput({
  label,
  desc,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  desc: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-semibold text-gray-800">{label}</label>
          {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
        </div>
        <span className="text-lg font-bold text-teal-600 min-w-[90px] text-right">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
      />
      <div className="flex justify-between text-xs text-gray-300">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function PlanResultCard({
  plan,
  savingsWithAI,
  employees,
  labels,
}: {
  plan: (typeof CONTENT)["id"]["plans"][0];
  savingsWithAI: number;
  employees: number;
  labels: (typeof CONTENT)["id"]["results"];
}) {
  const isOverLimit = employees > plan.employeeLimit;
  // Being past the biggest plan that carries a price is not the same failure as
  // being past a plan you can simply upgrade out of. The savings this visitor
  // would make are just as real — only the subscription cost is unknown, so
  // that is the single thing this card stops claiming. Greying the whole card
  // here would hand the least useful page to the largest prospect.
  const isCustomMode = isOverLimit && plan.overLimitMode === "custom";
  const isDeadEnd = isOverLimit && !isCustomMode;
  const isRecommended = !isOverLimit;
  const net = isOverLimit ? 0 : savingsWithAI - plan.price;
  const roi = net > 0 ? (net / plan.price) * 100 : 0;
  const payback = !isOverLimit && savingsWithAI > 0 ? Math.ceil((plan.price / savingsWithAI) * 22) : 0;
  const isBlue = plan.color === "blue";
  // Decided from the card's state, not inside one of the two icon branches:
  // the custom-mode tile is near-black, and colouring only the Shield for it
  // left the Zap a blue card renders teal on near-black.
  const iconClass = `h-4 w-4 ${
    isDeadEnd ? "text-gray-400"
      : isCustomMode ? "text-white"
      : isBlue ? "text-teal-600"
      : "text-teal-700"
  }`;

  return (
    <div className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all ${
      isDeadEnd
        ? "border-gray-200 opacity-60"
        : isCustomMode
        ? "border-gray-900 shadow-lg"
        : isBlue
        ? "border-teal-500 shadow-teal-100 shadow-lg"
        : "border-teal-400 shadow-teal-100 shadow-lg"
    }`}>
      {/* Badge */}
      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
        {isCustomMode ? (
          // A star, not a warning triangle: nothing has gone wrong for this
          // visitor, they are simply the size that gets a tailored plan.
          <span className="bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
            <Sparkles className="h-3 w-3" />{plan.overLimitLabel}
          </span>
        ) : isOverLimit ? (
          <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
            <AlertTriangle className="h-3 w-3" />{plan.overLimitLabel}
          </span>
        ) : isRecommended ? (
          <span className={`text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap ${isBlue ? "bg-teal-600" : "bg-teal-700"}`}>
            <CheckCircle2 className="h-3 w-3" />{plan.recommendedLabel}
          </span>
        ) : null}
      </div>

      {/* Plan header */}
      <div className="flex items-center gap-2 mb-1 mt-2">
        <div className={`p-1.5 rounded-lg ${isDeadEnd ? "bg-gray-100" : isCustomMode ? "bg-gray-900" : isBlue ? "bg-teal-50" : "bg-violet-50"}`}>
          {isBlue ? <Zap className={iconClass} /> : <Shield className={iconClass} />}
        </div>
        <h3 className="font-bold text-gray-900">{isCustomMode ? plan.overLimitName || plan.name : plan.name}</h3>
      </div>
      {/* The listed price is withdrawn, not struck through: at this size it was
          never the price this visitor would pay. */}
      <p className={`text-sm font-semibold mb-0.5 ${isDeadEnd ? "text-gray-400" : isCustomMode ? "text-gray-900" : isBlue ? "text-teal-600" : "text-teal-700"}`}>
        {isCustomMode ? labels.pending : plan.priceLabel}
      </p>
      <p className="text-xs text-gray-400 mb-4">{isCustomMode ? plan.overLimitDesc : plan.limit}</p>

      {/* Over-limit warning — only for the card that really is a dead end.
          The Custom card already carries its message under the plan name. */}
      {isDeadEnd && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700">{plan.overLimitDesc}</p>
        </div>
      )}

      {/* Numbers */}
      <div className={`space-y-3 flex-1 ${isDeadEnd ? "opacity-40 pointer-events-none" : ""}`}>
        {/* The saving stays a real number in Custom mode — it comes from the
            visitor's own inputs and owes nothing to which plan they buy. */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{labels.savingsAI}</span>
          <span className="font-semibold text-green-600">{formatRp(savingsWithAI)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{labels.subscription}</span>
          <span className="text-gray-500">
            {isCustomMode ? labels.pending : `- ${formatRp(plan.price)}`}
          </span>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-semibold text-gray-700">{labels.netSaving}</span>
          <span className={`font-bold text-xl ${!isCustomMode && net > 0 ? "text-green-600" : "text-gray-400"}`}>
            {isCustomMode ? labels.pendingShort : net > 0 ? formatRp(net) : "-"}
          </span>
        </div>
      </div>

      {/* ROI badges */}
      <div className={`grid grid-cols-2 gap-3 mt-5 mb-5 p-4 rounded-xl ${
        isDeadEnd ? "bg-gray-100" : isCustomMode ? "bg-gray-50" : isBlue ? "bg-teal-50" : "bg-violet-50"
      }`}>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">{labels.roi}</p>
          <p className={`text-2xl font-bold ${isDeadEnd ? "text-gray-300" : isCustomMode ? "text-gray-400" : isBlue ? "text-teal-600" : "text-teal-700"}`}>
            {!isOverLimit && roi > 0 ? `${roi.toFixed(0)}%` : isCustomMode ? labels.pendingShort : "-"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">{labels.payback}</p>
          <p className={`text-2xl font-bold ${isDeadEnd ? "text-gray-300" : isCustomMode ? "text-gray-400" : isBlue ? "text-teal-600" : "text-teal-700"}`}>
            {!isOverLimit && payback > 0 ? payback : isCustomMode ? labels.pendingShort : "-"}
            {!isOverLimit && payback > 0 && <span className="text-sm font-normal ml-0.5">{labels.paybackUnit}</span>}
          </p>
        </div>
      </div>

      <Link href={isOverLimit ? plan.overLimitHref : plan.ctaHref}>
        <Button
          className={`w-full gap-2 ${
            isDeadEnd
              ? "bg-gray-300 hover:bg-gray-400 text-gray-600"
              : isCustomMode
              ? "bg-gray-900 hover:bg-gray-800"
              : isBlue
              ? "bg-teal-600 hover:bg-teal-700"
              : "bg-teal-700 hover:bg-teal-800"
          }`}
        >
          {isOverLimit ? plan.overLimitCta : plan.cta}
          {!isOverLimit && <ArrowRight className="h-4 w-4" />}
        </Button>
      </Link>
    </div>
  );
}

export default function ROIPage() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  // Override the static plan prices with the current effective price (promo
  // until Dec 2026, then normal) so the ROI math and labels stay in sync.
  const plans = T.plans.map((p) => {
    const price = getPlanPrice(p.key as PurchasablePlan);
    return {
      ...p,
      price,
      priceLabel: `${formatRupiah(price, lang)} / ${lang === "id" ? "bulan" : "month"}`,
      // An empty overLimitHref in the copy means "there is no page to send them
      // to" — the org is past the largest self-serve plan, so the next step is a
      // conversation, not a checkout.
      overLimitHref: p.overLimitHref || consultationMailto(lang),
    };
  });

  const [employees, setEmployees] = useState(ROI_DEFAULTS.employees);
  const [questionsPerDay, setQuestionsPerDay] = useState(ROI_DEFAULTS.questionsPerDay);
  const [minutesPerSearch, setMinutesPerSearch] = useState(ROI_DEFAULTS.minutesPerSearch);
  const [salaryPerMonth, setSalaryPerMonth] = useState(ROI_DEFAULTS.salaryPerMonth);
  const [workingDays, setWorkingDays] = useState(ROI_DEFAULTS.workingDays);

  const results = useMemo(
    () => calculateRoi({ employees, questionsPerDay, minutesPerSearch, salaryPerMonth, workingDays }),
    [employees, questionsPerDay, minutesPerSearch, salaryPerMonth, workingDays],
  );

  // Read from the plans themselves rather than repeating their caps here: the
  // two used to be able to disagree, and the one that lost was the literal.
  //
  // Neither of these assumes there are exactly two plans, or that the copy
  // lists them smallest-first. The previous `plans[0]` / `plans[length - 1]`
  // pair assumed both, which a third tier or a reordered array would have
  // broken silently — recommending a plan the company does not fit in.
  const largestPlan = plans.reduce((a, b) => (b.employeeLimit > a.employeeLimit ? b : a));
  // The smallest plan the company actually fits in — which is also the cheapest
  // while price rises with capacity, but capacity is what is being matched
  // here. Nothing fitting is exactly the custom case handled below.
  const recommendedPlan =
    [...plans].sort((a, b) => a.employeeLimit - b.employeeLimit)
      .find((p) => employees <= p.employeeLimit) ?? largestPlan;
  // Past the largest plan that has a price, there is nothing to subtract — the
  // closing figure becomes the gross saving and says so. Subtracting the
  // Enterprise price anyway would print a "net saving" for a plan the cards
  // directly above have just told this visitor they cannot buy.
  //
  // Measured against `largestPlan`, not `recommendedPlan`: those are the same
  // object only while the recommendation still lands on the biggest tier. Lower
  // Professional's cap below Enterprise's and the recommendedPlan form starts
  // claiming a small company needs a custom contract.
  const needsCustomPlan = employees > largestPlan.employeeLimit;
  const headlineSaving = needsCustomPlan
    ? results.savingsWithAI
    : Math.max(0, results.savingsWithAI - recommendedPlan.price);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <LogoFull size="sm" className="shrink-0" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden md:block">
              {T.nav.price}
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.nav.login}</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">{T.nav.start}</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-14 px-6">
        <div className="max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
            <Calculator className="h-3.5 w-3.5" />
            {T.badge}
          </span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-gray-900 mb-4">{T.title}</h1>
          <p className="text-gray-500 text-lg leading-relaxed">{T.subtitle}</p>
        </div>
      </section>

      {/* Calculator — inputs */}
      <section className="max-w-6xl mx-auto px-6 pb-6">
        <div className="bg-raised rounded-2xl border border-hairline p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-8">
            <div className="p-2 bg-teal-50 rounded-lg">
              <Users className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="font-bold text-gray-900">{T.inputsTitle}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
            <SliderInput
              label={T.inputs.employees}
              desc={T.inputs.employeesDesc}
              value={employees}
              onChange={setEmployees}
              min={5} max={500} step={5}
              format={(v) => `${v}`}
            />
            <SliderInput
              label={T.inputs.questionsPerDay}
              desc={T.inputs.questionsDesc}
              value={questionsPerDay}
              onChange={setQuestionsPerDay}
              min={1} max={10} step={1}
              format={(v) => `${v}x`}
            />
            <SliderInput
              label={T.inputs.minutesPerSearch}
              desc={T.inputs.minutesDesc}
              value={minutesPerSearch}
              onChange={setMinutesPerSearch}
              min={5} max={60} step={5}
              format={(v) => `${v} mnt`}
            />
            <SliderInput
              label={T.inputs.salaryPerMonth}
              desc={T.inputs.salaryDesc}
              value={salaryPerMonth}
              onChange={setSalaryPerMonth}
              min={3_000_000} max={30_000_000} step={500_000}
              format={formatRp}
            />
            <SliderInput
              label={T.inputs.workingDays}
              desc=""
              value={workingDays}
              onChange={setWorkingDays}
              min={20} max={26} step={1}
              format={(v) => `${v} hari`}
            />
          </div>
        </div>
      </section>

      {/* Loss summary */}
      <section className="max-w-6xl mx-auto px-6 pb-6">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <TrendingDown className="h-6 w-6 text-red-500 shrink-0" />
            <div>
              <p className="font-bold text-gray-900">{T.lossCard.title}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3.5 w-3.5" />
                {results.hoursPerMonth.toFixed(0)} {T.lossCard.hoursUnit} {T.lossCard.hoursLost.split("/")[1] ? `/ ${T.lossCard.hoursLost.split("/")[1]}` : ""}
              </p>
            </div>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs text-gray-400 mb-0.5">{T.lossCard.costLost}</p>
            <p className="text-4xl font-bold text-red-600">{formatRp(results.costLost)}</p>
          </div>
        </div>
      </section>

      {/* Plan comparison */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">{T.compTitle}</h2>
          </div>
          <p className="text-gray-500 text-sm">{T.compDesc}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {plans.map((plan) => (
            <PlanResultCard
              key={plan.key}
              plan={plan}
              savingsWithAI={results.savingsWithAI}
              employees={employees}
              labels={T.results}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-6 text-center">{ESTIMATE_NOTE[lang]}</p>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-700 to-[#061C24] py-20 px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-white mb-2">{T.cta.title}</h2>
        <p className="text-5xl font-black text-white mb-4">{formatRp(headlineSaving)}<span className="text-xl font-normal text-teal-200"> / {lang === "id" ? "bulan" : "month"}</span></p>
        <p className="text-teal-100 mb-8">{needsCustomPlan ? T.cta.descCustom : T.cta.desc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="bg-white text-teal-600 hover:bg-teal-50 gap-2 font-semibold h-12 px-8">
              {T.cta.btn} <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          {/* A visitor this size has just been told their plan is agreed in a
              conversation, so "view pricing" is the one page that cannot help
              them — the second button becomes that conversation instead. */}
          {needsCustomPlan ? (
            <a href={consultationMailto(lang)}>
              <Button size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8">
                {T.cta.contact}
              </Button>
            </a>
          ) : (
            <Link href="/pricing">
              <Button size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8">
                {T.cta.pricing}
              </Button>
            </Link>
          )}
        </div>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
