"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Users, TrendingUp, Download, Sheet } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

interface Analytics {
  totalSessions: number;
  totalMessages: number;
  totalDocuments: number;
  totalEmployees: number;
  recentQuestions: { title: string; createdAt: string }[];
}

export function AnalyticsTab({ lang = "id" }: { lang?: Lang }) {
  const T = adminT[lang];
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d: Analytics) => setData(d))
      .catch(() => {});
  }, []);


  async function handleExportExcel() {
    if (!data) return;
    const ExcelJS = (await import("exceljs")).default;

    const wb = new ExcelJS.Workbook();

    // Sheet 1: Ringkasan
    const ws1 = wb.addWorksheet("Ringkasan");
    ws1.columns = [{ width: 25 }, { width: 15 }];
    ws1.addRows([
      ["IntelliBase AI — Laporan Analitik"],
      ["Digenerate pada", new Date().toLocaleString("id-ID")],
      [""],
      ["Metrik", "Jumlah"],
      ["Total Sesi Chat", data.totalSessions],
      ["Total Pertanyaan", data.totalMessages],
      ["Total Dokumen", data.totalDocuments],
      ["Total Karyawan", data.totalEmployees],
    ]);

    // Sheet 2: Pertanyaan Terbaru
    const ws2 = wb.addWorksheet("Pertanyaan Terbaru");
    ws2.columns = [{ width: 5 }, { width: 60 }, { width: 15 }];
    ws2.addRows([
      ["No", "Pertanyaan", "Tanggal"],
      ...data.recentQuestions.map((q, i) => [
        i + 1,
        q.title,
        new Date(q.createdAt).toLocaleDateString("id-ID"),
      ]),
    ]);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IntelliBase_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

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
    { label: T.totalChat, value: data.totalSessions, icon: MessageSquare, color: "text-blue-600 bg-blue-50" },
    { label: T.totalQuestion, value: data.totalMessages, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
    { label: T.totalDoc, value: data.totalDocuments, icon: FileText, color: "text-green-600 bg-green-50" },
    { label: T.totalEmployee, value: data.totalEmployees, icon: Users, color: "text-orange-600 bg-orange-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
          <Sheet className="h-4 w-4 text-green-600" />
          {T.exportExcel}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
          <Download className="h-4 w-4 text-red-500" />
          {T.exportPDF}
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
          <CardTitle className="text-base">{T.recentQ}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentQuestions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{T.noQuestion}</p>
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
