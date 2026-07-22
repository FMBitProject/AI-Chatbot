"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/lib/language-context";
import { getPlanPrice, formatRupiah, type PaidPlan } from "@/lib/pricing";
import { ArrowRight, Users, Clock, TrendingDown, TrendingUp, Calculator, Zap, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";

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
      },
      {
        key: "enterprise",
        name: "Enterprise",
        price: 500_000,
        priceLabel: "Rp 500.000 / bulan",
        limit: "Karyawan & dokumen tidak terbatas",
        employeeLimit: Infinity,
        color: "violet",
        cta: "Mulai Enterprise",
        ctaHref: "/register?plan=enterprise",
        recommendedLabel: "Cocok untuk Tim Anda",
        overLimitLabel: "",
        overLimitDesc: "",
      },
    ],
    results: {
      savingsAI: "Penghematan AI (90%)",
      subscription: "Biaya Langganan",
      netSaving: "Hemat Bersih / Bulan",
      roi: "ROI",
      payback: "Balik Modal",
      paybackUnit: "hari",
    },
    cta: {
      title: "Siap Mulai Menghemat?",
      desc: "Mulai gratis, setup 10 menit, tidak perlu kartu kredit.",
      btn: "Coba Gratis Dulu",
      pricing: "Lihat Detail Harga",
    },
    note: "* Estimasi menggunakan asumsi 90% pengurangan waktu pencarian. Hasil aktual dapat bervariasi.",
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
      },
      {
        key: "enterprise",
        name: "Enterprise",
        price: 500_000,
        priceLabel: "Rp 500,000 / month",
        limit: "Unlimited employees & documents",
        employeeLimit: Infinity,
        color: "violet",
        cta: "Start Enterprise",
        ctaHref: "/register?plan=enterprise",
        recommendedLabel: "Right for Your Team",
        overLimitLabel: "",
        overLimitDesc: "",
      },
    ],
    results: {
      savingsAI: "AI Savings (90%)",
      subscription: "Subscription Cost",
      netSaving: "Net Savings / Month",
      roi: "ROI",
      payback: "Payback",
      paybackUnit: "days",
    },
    cta: {
      title: "Ready to Start Saving?",
      desc: "Start free, 10-minute setup, no credit card required.",
      btn: "Try Free First",
      pricing: "View Full Pricing",
    },
    note: "* Estimate uses 90% search time reduction assumption. Actual results may vary.",
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
  const isRecommended = !isOverLimit;
  const net = isOverLimit ? 0 : savingsWithAI - plan.price;
  const roi = net > 0 ? (net / plan.price) * 100 : 0;
  const payback = !isOverLimit && savingsWithAI > 0 ? Math.ceil((plan.price / savingsWithAI) * 22) : 0;
  const isBlue = plan.color === "blue";

  return (
    <div className={`relative rounded-2xl border-2 p-6 flex flex-col transition-all ${
      isOverLimit
        ? "border-gray-200 opacity-60"
        : isBlue
        ? "border-teal-500 shadow-teal-100 shadow-lg"
        : "border-teal-400 shadow-teal-100 shadow-lg"
    }`}>
      {/* Badge */}
      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
        {isOverLimit ? (
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
        <div className={`p-1.5 rounded-lg ${isOverLimit ? "bg-gray-100" : isBlue ? "bg-teal-50" : "bg-violet-50"}`}>
          {isBlue
            ? <Zap className={`h-4 w-4 ${isOverLimit ? "text-gray-400" : "text-teal-600"}`} />
            : <Shield className={`h-4 w-4 ${isOverLimit ? "text-gray-400" : "text-teal-700"}`} />
          }
        </div>
        <h3 className="font-bold text-gray-900">{plan.name}</h3>
      </div>
      <p className={`text-sm font-semibold mb-0.5 ${isOverLimit ? "text-gray-400" : isBlue ? "text-teal-600" : "text-teal-700"}`}>
        {plan.priceLabel}
      </p>
      <p className="text-xs text-gray-400 mb-4">{plan.limit}</p>

      {/* Over-limit warning */}
      {isOverLimit && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-700">{plan.overLimitDesc}</p>
        </div>
      )}

      {/* Numbers */}
      <div className={`space-y-3 flex-1 ${isOverLimit ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{labels.savingsAI}</span>
          <span className="font-semibold text-green-600">{formatRp(savingsWithAI)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{labels.subscription}</span>
          <span className="text-gray-500">- {formatRp(plan.price)}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-semibold text-gray-700">{labels.netSaving}</span>
          <span className={`font-bold text-xl ${net > 0 ? "text-green-600" : "text-gray-400"}`}>
            {net > 0 ? formatRp(net) : "-"}
          </span>
        </div>
      </div>

      {/* ROI badges */}
      <div className={`grid grid-cols-2 gap-3 mt-5 mb-5 p-4 rounded-xl ${
        isOverLimit ? "bg-gray-100" : isBlue ? "bg-teal-50" : "bg-violet-50"
      }`}>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">{labels.roi}</p>
          <p className={`text-2xl font-bold ${isOverLimit ? "text-gray-300" : isBlue ? "text-teal-600" : "text-teal-700"}`}>
            {!isOverLimit && roi > 0 ? `${roi.toFixed(0)}%` : "-"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-0.5">{labels.payback}</p>
          <p className={`text-2xl font-bold ${isOverLimit ? "text-gray-300" : isBlue ? "text-teal-600" : "text-teal-700"}`}>
            {!isOverLimit && payback > 0 ? payback : "-"}
            {!isOverLimit && payback > 0 && <span className="text-sm font-normal ml-0.5">{labels.paybackUnit}</span>}
          </p>
        </div>
      </div>

      <Link href={isOverLimit ? "/pricing" : plan.ctaHref}>
        <Button
          className={`w-full gap-2 ${
            isOverLimit
              ? "bg-gray-300 hover:bg-gray-400 text-gray-600"
              : isBlue
              ? "bg-teal-600 hover:bg-teal-700"
              : "bg-teal-700 hover:bg-teal-800"
          }`}
        >
          {isOverLimit ? (isBlue ? "Lihat Enterprise →" : plan.cta) : plan.cta}
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
    const price = getPlanPrice(p.key as PaidPlan);
    return { ...p, price, priceLabel: `${formatRupiah(price, lang)} / ${lang === "id" ? "bulan" : "month"}` };
  });

  const [employees, setEmployees] = useState(50);
  const [questionsPerDay, setQuestionsPerDay] = useState(3);
  const [minutesPerSearch, setMinutesPerSearch] = useState(20);
  const [salaryPerMonth, setSalaryPerMonth] = useState(6_000_000);
  const [workingDays, setWorkingDays] = useState(22);

  const results = useMemo(() => {
    const minutesPerMonth = employees * questionsPerDay * minutesPerSearch * workingDays;
    const hoursPerMonth = minutesPerMonth / 60;
    const hourlyRate = salaryPerMonth / (workingDays * 8);
    const costLost = hoursPerMonth * hourlyRate;
    const savingsWithAI = costLost * 0.9;
    return { hoursPerMonth, costLost, savingsWithAI };
  }, [employees, questionsPerDay, minutesPerSearch, salaryPerMonth, workingDays]);

  const recommendedPlan = employees > 50 ? plans[1] : plans[0];
  const bestNet = Math.max(0, results.savingsWithAI - recommendedPlan.price);

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
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
      <section className="text-center py-16 px-6 bg-gradient-to-b from-teal-50 via-white to-white">
        <div className="max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
            <Calculator className="h-3.5 w-3.5" />
            {T.badge}
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{T.title}</h1>
          <p className="text-gray-500 text-lg leading-relaxed">{T.subtitle}</p>
        </div>
      </section>

      {/* Calculator — inputs */}
      <section className="max-w-6xl mx-auto px-6 pb-6">
        <div className="bg-white rounded-2xl border p-8 shadow-sm">
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
        <p className="text-xs text-gray-400 mt-6 text-center">{T.note}</p>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-700 to-[#061C24] py-20 px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-2">{T.cta.title}</h2>
        <p className="text-5xl font-black text-white mb-4">{formatRp(bestNet)}<span className="text-xl font-normal text-teal-200"> / {lang === "id" ? "bulan" : "month"}</span></p>
        <p className="text-teal-100 mb-8">{T.cta.desc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="bg-white text-teal-600 hover:bg-teal-50 gap-2 font-semibold h-12 px-8">
              {T.cta.btn} <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" className="bg-transparent border border-white text-white hover:bg-white/10 h-12 px-8">
              {T.cta.pricing}
            </Button>
          </Link>
        </div>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
