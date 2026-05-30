import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <LogoFull size="md" className="mb-8" />
      <div className="flex justify-center mb-4">
        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
          <SearchX className="h-8 w-8 text-gray-400" />
        </div>
      </div>
      <h1 className="text-6xl font-bold text-gray-200 mb-2">404</h1>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Halaman Tidak Ditemukan</h2>
      <p className="text-gray-400 text-sm mb-8 max-w-sm">
        Halaman yang Anda cari tidak ada atau sudah dipindahkan.
      </p>
      <div className="flex gap-3">
        <Link href="/"><Button variant="outline">Beranda</Button></Link>
        <Link href="/chat"><Button className="bg-blue-600 hover:bg-blue-700">Buka Chat</Button></Link>
      </div>
    </div>
  );
}
