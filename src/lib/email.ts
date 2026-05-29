import { Resend } from "resend";

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

  await getResend().emails.send({
    from: `TanyaInternal AI <noreply@${process.env.EMAIL_DOMAIN ?? "tanyainternal.com"}>`,
    to,
    subject: `[${companyName}] Dokumen baru tersedia: ${documentName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:24px;">
          <span style="font-size:20px; font-weight:bold; color:#1d4ed8;">TanyaInternal AI</span>
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
