import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { XCircle } from "lucide-react";
import Link from "next/link";

export default function PaymentFailedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center shadow-sm">
        <LogoFull size="md" className="justify-center mb-6" />
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Pembayaran Gagal</h1>
        <p className="text-gray-500 text-sm mb-6">
          Pembayaran tidak berhasil diproses. Silakan coba lagi atau gunakan metode pembayaran lain.
        </p>
        <div className="flex gap-3">
          <Link href="/pricing" className="flex-1">
            <Button variant="outline" className="w-full">Coba Lagi</Button>
          </Link>
          <Link href="/admin" className="flex-1">
            <Button className="w-full bg-blue-600 hover:bg-blue-700">Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
