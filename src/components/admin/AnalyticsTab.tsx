"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Users, TrendingUp, Mail } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Analytics {
  totalSessions: number;
  totalMessages: number;
  totalDocuments: number;
  totalEmployees: number;
  recentQuestions: { title: string; createdAt: string }[];
}

export function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d: Analytics) => setData(d))
      .catch(() => {});
  }, []);

  async function handleSendDigest() {
    try {
      await fetch("/api/admin/weekly-digest", { method: "POST" });
      toast({ title: "Weekly digest berhasil dikirim ke semua admin!" });
    } catch {
      toast({ variant: "destructive", title: "Gagal mengirim digest." });
    }
  }

  if (!data) return <div className="text-center py-10 text-gray-400 text-sm">Memuat data...</div>;

  const stats = [
    { label: "Total Sesi Chat", value: data.totalSessions, icon: MessageSquare, color: "text-blue-600 bg-blue-50" },
    { label: "Total Pertanyaan", value: data.totalMessages, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
    { label: "Total Dokumen", value: data.totalDocuments, icon: FileText, color: "text-green-600 bg-green-50" },
    { label: "Total Karyawan", value: data.totalEmployees, icon: Users, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleSendDigest} className="gap-2">
          <Mail className="h-4 w-4" />
          Kirim Weekly Digest
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pertanyaan Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentQuestions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Belum ada pertanyaan</p>
          ) : (
            <ul className="space-y-2">
              {data.recentQuestions.map((q, i) => (
                <li key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <span className="text-gray-700 truncate flex-1">{q.title}</span>
                  <span className="text-gray-400 text-xs ml-4 shrink-0">
                    {new Date(q.createdAt).toLocaleDateString("id-ID")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
