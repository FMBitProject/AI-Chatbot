"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Users, TrendingUp, Mail, Download, Sheet } from "lucide-react";
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
      const res = await fetch("/api/admin/weekly-digest", { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        toast({ variant: "destructive", title: "Gagal mengirim digest.", description: d.error });
      } else {
        toast({ title: "Weekly digest berhasil dikirim!" });
      }
    } catch {
      toast({ variant: "destructive", title: "Gagal mengirim digest." });
    }
  }

  async function handleExportExcel() {
    if (!data) return;
    const { utils, writeFile } = await import("xlsx");

    const wb = utils.book_new();

    // Sheet 1: Ringkasan
    const summaryData = [
      ["IntelliBase AI — Laporan Analitik"],
      ["Digenerate pada", new Date().toLocaleString("id-ID")],
      [""],
      ["Metrik", "Jumlah"],
      ["Total Sesi Chat", data.totalSessions],
      ["Total Pertanyaan", data.totalMessages],
      ["Total Dokumen", data.totalDocuments],
      ["Total Karyawan", data.totalEmployees],
    ];
    const ws1 = utils.aoa_to_sheet(summaryData);
    ws1["!cols"] = [{ wch: 25 }, { wch: 15 }];
    utils.book_append_sheet(wb, ws1, "Ringkasan");

    // Sheet 2: Pertanyaan Terbaru
    const questionData = [
      ["No", "Pertanyaan", "Tanggal"],
      ...data.recentQuestions.map((q, i) => [
        i + 1,
        q.title,
        new Date(q.createdAt).toLocaleDateString("id-ID"),
      ]),
    ];
    const ws2 = utils.aoa_to_sheet(questionData);
    ws2["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 15 }];
    utils.book_append_sheet(wb, ws2, "Pertanyaan Terbaru");

    writeFile(wb, `IntelliBase_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel berhasil diunduh!" });
  }

  async function handleExportPDF() {
    if (!data) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("IntelliBase AI", margin, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Laporan Analitik", margin, 19);
    doc.text(new Date().toLocaleDateString("id-ID"), pageW - margin, 19, { align: "right" });
    y = 38;

    // Title
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Ringkasan Aktivitas Platform", margin, y);
    y += 10;

    // Stats boxes
    const stats = [
      { label: "Total Sesi Chat", value: data.totalSessions },
      { label: "Total Pertanyaan", value: data.totalMessages },
      { label: "Total Dokumen", value: data.totalDocuments },
      { label: "Total Karyawan", value: data.totalEmployees },
    ];
    const boxW = (pageW - margin * 2 - 12) / 4;
    stats.forEach((s, i) => {
      const x = margin + i * (boxW + 4);
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(x, y, boxW, 20, 2, 2, "F");
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(String(s.value), x + boxW / 2, y + 11, { align: "center" });
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(s.label, x + boxW / 2, y + 17, { align: "center" });
    });
    y += 28;

    // Questions table
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(17, 24, 39);
    doc.text("Pertanyaan Terbaru Karyawan", margin, y);
    y += 6;

    // Table header
    doc.setFillColor(37, 99, 235);
    doc.rect(margin, y, pageW - margin * 2, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("No", margin + 2, y + 5);
    doc.text("Pertanyaan", margin + 12, y + 5);
    doc.text("Tanggal", pageW - margin - 22, y + 5);
    y += 7;

    // Table rows
    data.recentQuestions.forEach((q, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFillColor(i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 251 : 255);
      doc.rect(margin, y, pageW - margin * 2, 7, "F");
      doc.setTextColor(55, 65, 81);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(String(i + 1), margin + 2, y + 5);
      const truncated = q.title.length > 70 ? q.title.slice(0, 70) + "..." : q.title;
      doc.text(truncated, margin + 12, y + 5);
      doc.text(new Date(q.createdAt).toLocaleDateString("id-ID"), pageW - margin - 22, y + 5);
      y += 7;
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text("IntelliBase AI · Laporan digenerate otomatis", pageW / 2, 287, { align: "center" });

    doc.save(`IntelliBase_Analytics_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "PDF berhasil diunduh!" });
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
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
          <Sheet className="h-4 w-4 text-green-600" />
          Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
          <Download className="h-4 w-4 text-red-500" />
          Export PDF
        </Button>
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
