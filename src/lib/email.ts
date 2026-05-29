import { Resend } from "resend";

export async function sendWeeklyDigest({
  to, companyName, totalChats, topQuestions, totalDocuments, appUrl,
}: {
  to: string[];
  companyName: string;
  totalChats: number;
  topQuestions: string[];
  totalDocuments: number;
  appUrl: string;
}) {
  if (!process.env.RESEND_API_KEY || to.length === 0) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const domain = process.env.EMAIL_DOMAIN ?? "resend.dev";
  const fromAddress = domain === "resend.dev"
    ? "IntelliBase <onboarding@resend.dev>"
    : `IntelliBase <noreply@${domain}>`;
  await resend.emails.send({
    from: fromAddress,
    to,
    subject: `📊 Weekly Digest IntelliBase — ${companyName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#1d4ed8;">📊 Weekly Digest — ${companyName}</h2>
        <p style="color:#6b7280;">Ringkasan aktivitas IntelliBase minggu ini:</p>
        <div style="display:flex; gap:16px; margin:20px 0;">
          <div style="flex:1; background:#eff6ff; border-radius:8px; padding:16px; text-align:center;">
            <p style="font-size:28px; font-weight:bold; color:#2563eb; margin:0;">${totalChats}</p>
            <p style="font-size:12px; color:#6b7280; margin:4px 0 0;">Total Sesi Chat</p>
          </div>
          <div style="flex:1; background:#f0fdf4; border-radius:8px; padding:16px; text-align:center;">
            <p style="font-size:28px; font-weight:bold; color:#16a34a; margin:0;">${totalDocuments}</p>
            <p style="font-size:12px; color:#6b7280; margin:4px 0 0;">Total Dokumen</p>
          </div>
        </div>
        <h3 style="color:#111827; font-size:14px;">💬 Pertanyaan Terbaru Karyawan:</h3>
        <ul style="padding-left:20px; color:#374151;">
          ${topQuestions.map((q) => `<li style="margin-bottom:4px; font-size:13px;">${q}</li>`).join("")}
        </ul>
        <a href="${appUrl}/admin" style="display:inline-block; background:#2563eb; color:white; padding:10px 20px; border-radius:8px; text-decoration:none; margin-top:16px; font-size:13px;">Buka Dashboard Admin →</a>
        <p style="color:#9ca3af; font-size:11px; margin-top:24px;">IntelliBase AI · Weekly Digest otomatis</p>
      </div>
    `,
  });
}

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendNewDocumentNotification({
  to,
  documentName,
  companyName,
  appUrl,
}: {
  to: string[];
  documentName: string;
  companyName: string;
  appUrl: string;
}) {
  if (!process.env.RESEND_API_KEY || to.length === 0) return;

  const domain2 = process.env.EMAIL_DOMAIN ?? "resend.dev";
  const fromAddress2 = domain2 === "resend.dev"
    ? "IntelliBase <onboarding@resend.dev>"
    : `IntelliBase <noreply@${domain2}>`;
  await getResend().emails.send({
    from: fromAddress2,
    to,
    subject: `[${companyName}] Dokumen baru tersedia: ${documentName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:24px;">
          <span style="font-size:20px; font-weight:bold; color:#1d4ed8;">IntelliBase</span>
        </div>
        <h2 style="color:#111827; margin-bottom:8px;">Dokumen Baru Tersedia</h2>
        <p style="color:#6b7280; margin-bottom:16px;">
          Admin <strong>${companyName}</strong> baru saja mengunggah dokumen baru yang dapat Anda akses melalui chatbot.
        </p>
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:16px; margin-bottom:24px;">
          <p style="margin:0; font-size:14px; color:#0369a1;">
            📄 <strong>${documentName}</strong>
          </p>
        </div>
        <a href="${appUrl}/chat" style="display:inline-block; background:#2563eb; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:500;">
          Buka Chatbot →
        </a>
        <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
          Anda menerima email ini karena terdaftar sebagai karyawan di ${companyName}.
        </p>
      </div>
    `,
  });
}
