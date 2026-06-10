"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteFooter } from "@/components/SiteFooter";
import { useLang } from "@/lib/language-context";
import { ArrowRight, Users, Clock, TrendingDown, TrendingUp, Calculator } from "lucide-react";
import type { Metadata } from "next";

const CONTENT = {
  id: {
    nav: { price: "Harga", login: "Masuk", start: "Mulai Gratis", roi: "Kalkulator ROI" },
    badge: "Kalkulator ROI",
    title: "Berapa Banyak Waktu & Uang yang Terbuang?",
    subtitle: "Hitung estimasi kerugian perusahaan Anda akibat karyawan yang menghabiskan waktu mencari informasi internal secara manual.",
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
    results: {
      title: "Estimasi Kerugian Bulanan Tanpa IntelliBase",
      hoursLost: "Total Jam Terbuang / Bulan",
      costLost: "Biaya Waktu Terbuang / Bulan",
      withAI: "Penghematan dengan IntelliBase (90%)",
      subscription: "Biaya Langganan IntelliBase",
      netSaving: "Penghematan Bersih / Bulan",
      roi: "Return on Investment (ROI)",
      hoursUnit: "jam",
      paybackDays: "Balik modal dalam",
      paybackUnit: "hari",
    },
    cta: {
      title: "Siap Hemat hingga",
      title2: "per Bulan?",
      desc: "Mulai gratis, setup 10 menit, tidak perlu kartu kredit.",
      btn: "Mulai Gratis Sekarang",
      pricing: "Lihat Paket Harga",
    },
    note: "* Estimasi menggunakan asumsi 90% pengurangan waktu pencarian berdasarkan rata-rata penggunaan platform. Hasil aktual dapat bervariasi.",
    plan: "Professional (50 karyawan)",
  },
  en: {
    nav: { price: "Pricing", login: "Sign In", start: "Start Free", roi: "ROI Calculator" },
    badge: "ROI Calculator",
    title: "How Much Time & Money Is Being Wasted?",
    subtitle: "Calculate your company's estimated losses from employees spending time manually searching for internal information.",
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
    results: {
      title: "Estimated Monthly Loss Without IntelliBase",
      hoursLost: "Total Hours Wasted / Month",
      costLost: "Cost of Wasted Time / Month",
      withAI: "Savings with IntelliBase (90%)",
      subscription: "IntelliBase Subscription Cost",
      netSaving: "Net Savings / Month",
      roi: "Return on Investment (ROI)",
      hoursUnit: "hours",
      paybackDays: "Payback period",
      paybackUnit: "days",
    },
    cta: {
      title: "Ready to Save up to",
      title2: "per Month?",
      desc: "Start free, 10-minute setup, no credit card required.",
      btn: "Start Free Now",
      pricing: "View Pricing",
    },
    note: "* Estimate uses 90% search time reduction assumption based on platform usage averages. Actual results may vary.",
    plan: "Professional (50 employees)",
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
          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
        </div>
        <span className="text-lg font-bold text-blue-600 min-w-[80px] text-right">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-300">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

export default function ROIPage() {
  const { lang } = useLang();
  const T = CONTENT[lang];

  const [employees, setEmployees] = useState(50);
  const [questionsPerDay, setQuestionsPerDay] = useState(3);
  const [minutesPerSearch, setMinutesPerSearch] = useState(20);
  const [salaryPerMonth, setSalaryPerMonth] = useState(6_000_000);
  const [workingDays, setWorkingDays] = useState(22);

  const SUBSCRIPTION_COST = 200_000;

  const results = useMemo(() => {
    const minutesPerMonth = employees * questionsPerDay * minutesPerSearch * workingDays;
    const hoursPerMonth = minutesPerMonth / 60;
    const hourlyRate = salaryPerMonth / (workingDays * 8);
    const costLost = hoursPerMonth * hourlyRate;
    const savingsWithAI = costLost * 0.9;
    const netSaving = savingsWithAI - SUBSCRIPTION_COST;
    const roi = netSaving > 0 ? (netSaving / SUBSCRIPTION_COST) * 100 : 0;
    const paybackDays = savingsWithAI > 0 ? Math.ceil((SUBSCRIPTION_COST / savingsWithAI) * workingDays) : 0;
    return { hoursPerMonth, costLost, savingsWithAI, netSaving, roi, paybackDays };
  }, [employees, questionsPerDay, minutesPerSearch, salaryPerMonth, workingDays]);

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <LogoFull size="sm" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-800 font-medium hidden sm:block">
              {T.nav.price}
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">{T.nav.login}</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">{T.nav.start}</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-16 px-6 bg-gradient-to-b from-blue-50 via-white to-white">
        <div className="max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-5">
            <Calculator className="h-3.5 w-3.5" />
            {T.badge}
          </span>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{T.title}</h1>
          <p className="text-gray-500 text-lg leading-relaxed">{T.subtitle}</p>
        </div>
      </section>

      {/* Calculator */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="bg-white rounded-2xl border p-8 space-y-8 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <h2 className="font-bold text-gray-900">
                {lang === "id" ? "Data Perusahaan Anda" : "Your Company Data"}
              </h2>
            </div>

            <SliderInput
              label={T.inputs.employees}
              desc={T.inputs.employeesDesc}
              value={employees}
              onChange={setEmployees}
              min={5}
              max={500}
              step={5}
              format={(v) => `${v}`}
            />
            <SliderInput
              label={T.inputs.questionsPerDay}
              desc={T.inputs.questionsDesc}
              value={questionsPerDay}
              onChange={setQuestionsPerDay}
              min={1}
              max={10}
              step={1}
              format={(v) => `${v}x`}
            />
            <SliderInput
              label={T.inputs.minutesPerSearch}
              desc={T.inputs.minutesDesc}
              value={minutesPerSearch}
              onChange={setMinutesPerSearch}
              min={5}
              max={60}
              step={5}
              format={(v) => `${v} mnt`}
            />
            <SliderInput
              label={T.inputs.salaryPerMonth}
              desc={T.inputs.salaryDesc}
              value={salaryPerMonth}
              onChange={setSalaryPerMonth}
              min={3_000_000}
              max={30_000_000}
              step={500_000}
              format={formatRp}
            />
            <SliderInput
              label={T.inputs.workingDays}
              desc=""
              value={workingDays}
              onChange={setWorkingDays}
              min={20}
              max={26}
              step={1}
              format={(v) => `${v} hari`}
            />
          </div>

          {/* Results */}
          <div className="space-y-4">
            {/* Loss card */}
            <div className="bg-red-50 border border-red-100 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <TrendingDown className="h-5 w-5 text-red-500" />
                <h2 className="font-bold text-gray-900">{T.results.title}</h2>
              </div>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{T.results.hoursLost}</span>
                  </div>
                  <span className="font-bold text-gray-900 text-lg">
                    {results.hoursPerMonth.toFixed(0)} {T.results.hoursUnit}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-5">
                  <span className="text-sm text-gray-600">{T.results.costLost}</span>
                  <span className="font-bold text-red-600 text-2xl">{formatRp(results.costLost)}</span>
                </div>
              </div>
            </div>

            {/* Savings card */}
            <div className="bg-green-50 border border-green-100 rounded-2xl p-8">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <h2 className="font-bold text-gray-900">
                  {lang === "id" ? "Dengan IntelliBase AI" : "With IntelliBase AI"}
                </h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{T.results.withAI}</span>
                  <span className="font-bold text-green-600 text-xl">{formatRp(results.savingsWithAI)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{T.results.subscription} ({T.plan})</span>
                  <span className="text-gray-500">- {formatRp(SUBSCRIPTION_COST)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-4">
                  <span className="text-sm font-semibold text-gray-700">{T.results.netSaving}</span>
                  <span className={`font-bold text-2xl ${results.netSaving > 0 ? "text-green-600" : "text-gray-400"}`}>
                    {formatRp(Math.max(0, results.netSaving))}
                  </span>
                </div>
              </div>
            </div>

            {/* ROI badge */}
            <div className="bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl p-8 text-white">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <p className="text-blue-200 text-sm mb-1">{T.results.roi}</p>
                  <p className="text-4xl font-bold">
                    {results.roi > 0 ? `${results.roi.toFixed(0)}%` : "-"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-blue-200 text-sm mb-1">{T.results.paybackDays}</p>
                  <p className="text-4xl font-bold">
                    {results.paybackDays > 0 ? results.paybackDays : "-"}
                    {results.paybackDays > 0 && (
                      <span className="text-lg font-normal ml-1">{T.results.paybackUnit}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-6 text-center">{T.note}</p>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-violet-600 py-20 px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-3">
          {T.cta.title} {formatRp(Math.max(0, results.netSaving))} {T.cta.title2}
        </h2>
        <p className="text-blue-100 mb-8">{T.cta.desc}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 gap-2 font-semibold h-12 px-8">
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
