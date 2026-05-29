"use client";
import type { Message } from "@/components/chat/ChatMessages";

export async function exportChatToPDF(
  messages: Message[],
  sessionTitle: string,
  companyName?: string
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  function checkPage(needed = 10) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, maxWidth) as string[];
  }

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("IntelliBase AI", margin, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Internal Knowledge Base Platform", margin, 18);
  if (companyName) doc.text(companyName, pageW - margin, 18, { align: "right" });
  y = 38;

  // Title
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  const titleLines = wrapText(sessionTitle, contentW, 13);
  titleLines.forEach((line) => { doc.text(line, margin, y); y += 6; });
  y += 2;

  // Date
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`Diekspor pada: ${new Date().toLocaleString("id-ID")}`, margin, y);
  y += 8;

  // Divider
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Messages
  for (const msg of messages) {
    if (!msg.content) continue;
    checkPage(20);

    const isUser = msg.role === "user";

    // Role label
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(isUser ? 37 : 124, isUser ? 99 : 58, isUser ? 235 : 237);
    doc.text(isUser ? "KARYAWAN" : "INTELLIBASE AI", margin, y);
    y += 5;

    // Message bubble background
    const cleanContent = msg.content.replace(/\*\*/g, "").replace(/\*/g, "");
    const lines = wrapText(cleanContent, contentW - 6, 9);
    const bubbleH = lines.length * 4.5 + 6;
    checkPage(bubbleH + 4);

    if (isUser) {
      doc.setFillColor(239, 246, 255);
    } else {
      doc.setFillColor(249, 250, 251);
    }
    doc.roundedRect(margin, y, contentW, bubbleH, 2, 2, "F");

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(31, 41, 55);
    let lineY = y + 4;
    lines.forEach((line) => {
      checkPage(5);
      doc.text(line as string, margin + 3, lineY);
      lineY += 4.5;
    });
    y = lineY + 4;
  }

  // Footer
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`IntelliBase AI · Halaman ${i} dari ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
  }

  const fileName = `IntelliBase_${sessionTitle.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
