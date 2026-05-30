"use client";
import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <LogoFull size="md" className="mb-8" />
      <div className="flex justify-center mb-4">
        <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
      </div>
      <h1 className="text-6xl font-bold text-gray-200 mb-2">500</h1>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Terjadi Kesalahan</h2>
      <p className="text-gray-400 text-sm mb-8 max-w-sm">
        Terjadi kesalahan pada server. Tim kami sedang menangani masalah ini.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>Coba Lagi</Button>
        <Link href="/"><Button className="bg-blue-600 hover:bg-blue-700">Beranda</Button></Link>
      </div>
    </div>
  );
}
