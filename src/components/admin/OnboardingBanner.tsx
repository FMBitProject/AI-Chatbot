"use client";
import { useState } from "react";
import { CheckCircle2, Upload, Users, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface OnboardingBannerProps {
  hasDocuments: boolean;
  hasEmployees: boolean;
  lang?: "id" | "en";
}

export function OnboardingBanner({ hasDocuments, hasEmployees, lang = "id" }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const allDone = hasDocuments && hasEmployees;

  if (dismissed || allDone) return null;

  const steps = [
    {
      icon: Upload,
      title: lang === "en" ? "Upload your first document" : "Upload dokumen pertama",
      desc: lang === "en" ? "Add an SOP or HR policy so AI can answer questions." : "Tambahkan SOP atau kebijakan HR agar AI bisa menjawab pertanyaan.",
      done: hasDocuments,
      action: lang === "en" ? "Upload Now" : "Upload Sekarang",
      tab: "documents",
    },
    {
      icon: Users,
      title: lang === "en" ? "Add your employees" : "Tambahkan karyawan",
      desc: lang === "en" ? "Invite employees so they can access the AI chat." : "Undang karyawan agar bisa mengakses chat AI.",
      done: hasEmployees,
      action: lang === "en" ? "Add Employee" : "Tambah Karyawan",
      tab: "users",
    },
    {
      icon: MessageSquare,
      title: lang === "en" ? "Try the AI chat" : "Coba chat AI",
      desc: lang === "en" ? "Ask a question about your company documents." : "Tanyakan sesuatu tentang dokumen perusahaan Anda.",
      done: false,
      action: lang === "en" ? "Open Chat" : "Buka Chat",
      tab: null,
      href: "/chat",
    },
  ];

  const completedCount = [hasDocuments, hasEmployees].filter(Boolean).length;

  return (
    <div className="mb-6 bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100 rounded-2xl p-6 relative">
      <button onClick={() => setDismissed(true)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
      <div className="mb-4">
        <h3 className="font-bold text-gray-900 text-base">
          {lang === "en" ? "🎉 Welcome to IntelliBase AI!" : "🎉 Selamat datang di IntelliBase AI!"}
        </h3>
        <p className="text-gray-500 text-sm mt-1">
          {lang === "en"
            ? `Complete these steps to get started. ${completedCount}/2 done.`
            : `Selesaikan langkah berikut untuk mulai. ${completedCount}/2 selesai.`}
        </p>
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(completedCount / 2) * 100}%` }} />
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {steps.map((step) => (
          <div key={step.title} className={`rounded-xl p-4 border ${step.done ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-2">
              {step.done
                ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                : <step.icon className="h-5 w-5 text-blue-500 shrink-0" />}
              <p className={`text-sm font-semibold ${step.done ? "text-green-700 line-through" : "text-gray-800"}`}>
                {step.title}
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-3">{step.desc}</p>
            {!step.done && (
              step.href
                ? <Link href={step.href}><Button size="sm" variant="outline" className="text-xs h-7">{step.action}</Button></Link>
                : <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => {
                  document.querySelector(`[data-value="${step.tab}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                }}>{step.action}</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
