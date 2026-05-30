import { Button } from "@/components/ui/button";
import { LogoFull } from "@/components/Logo";
import { Clock } from "lucide-react";
import Link from "next/link";

export default function PaymentPendingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center shadow-sm">
        <LogoFull size="md" className="justify-center mb-6" />
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Menunggu Pembayaran</h1>
        <p className="text-gray-500 text-sm mb-2">
          Pembayaran Anda sedang diproses. Akun akan diupgrade otomatis setelah pembayaran dikonfirmasi.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Biasanya membutuhkan waktu 1-5 menit untuk transfer bank.
        </p>
        <Link href="/admin">
          <Button className="w-full bg-blue-600 hover:bg-blue-700">Kembali ke Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
