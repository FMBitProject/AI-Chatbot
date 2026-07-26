import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Resend } from "resend";

const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const resend = new Resend(process.env.RESEND_API_KEY);

// Must be an address on a domain verified at resend.com/domains. Resend's shared
// sandbox sender (onboarding@resend.dev) only ever delivers to the Resend
// account owner, which silently made every signup unusable: the account was
// created, the verification mail never arrived, and login stayed blocked on
// EMAIL_NOT_VERIFIED. Override with RESEND_FROM if the sending domain changes.
const MAIL_FROM = process.env.RESEND_FROM ?? "IntelliBase AI <noreply@intellibaseai.com>";

// Every outgoing mail goes through here so a delivery failure is loud in the
// Vercel logs and propagates to the caller, instead of disappearing and leaving
// a user stranded with an account they can never verify.
async function sendMail(opts: { to: string; subject: string; html: string }) {
  const { error } = await resend.emails.send({ from: MAIL_FROM, ...opts });
  if (error) {
    console.error(`[mail] FAILED to=${opts.to} subject="${opts.subject}" from=${MAIL_FROM}:`, error);
    throw new Error(`Email delivery failed: ${error.message ?? "unknown error"}`);
  }
  console.log(`[mail] sent to=${opts.to} subject="${opts.subject}"`);
}

export const auth = betterAuth({
  baseURL: appUrl,
  trustedOrigins: [appUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    // Company admins have nobody above them to reset their password — an admin
    // who forgets it would be locked out of a paid account for good without
    // this. (Employees can always be reset by their own admin.)
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Atur Ulang Kata Sandi — IntelliBase AI",
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#f9fafb;">
            <div style="background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              <h2 style="color:#0d9488;margin:0 0 8px;">IntelliBase AI</h2>
              <h3 style="color:#111827;margin:0 0 16px;">Atur Ulang Kata Sandi</h3>
              <p style="color:#374151;line-height:1.6;">Halo <strong>${user.name}</strong>,</p>
              <p style="color:#374151;line-height:1.6;">Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda. Klik tombol di bawah untuk membuat kata sandi baru.</p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${url}" style="display:inline-block;background:#0d9488;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Atur Ulang Kata Sandi</a>
              </div>
              <p style="color:#6b7280;font-size:13px;line-height:1.6;">Link ini berlaku selama 1 jam dan hanya bisa dipakai sekali. Jika Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
              <p style="color:#9ca3af;font-size:12px;text-align:center;">© 2026 IntelliBase AI</p>
            </div>
          </div>
        `,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verifikasi Email Anda — IntelliBase AI",
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#f9fafb;">
            <div style="background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              <h2 style="color:#1d4ed8;margin:0 0 8px;">IntelliBase AI</h2>
              <h3 style="color:#111827;margin:0 0 16px;">Verifikasi Email Anda</h3>
              <p style="color:#374151;line-height:1.6;">Halo <strong>${user.name}</strong>,</p>
              <p style="color:#374151;line-height:1.6;">Terima kasih telah mendaftar. Klik tombol di bawah untuk memverifikasi email Anda dan mulai menggunakan IntelliBase AI.</p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${url}" style="display:inline-block;background:#2563eb;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Verifikasi Email</a>
              </div>
              <p style="color:#6b7280;font-size:13px;line-height:1.6;">Link ini berlaku selama 24 jam. Jika Anda tidak mendaftar di IntelliBase AI, abaikan email ini.</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
              <p style="color:#9ca3af;font-size:12px;text-align:center;">© 2026 IntelliBase AI</p>
            </div>
          </div>
        `,
      });
    },
  },
  user: {
    additionalFields: {
      companyId: {
        type: "string",
        required: false,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "employee",
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
  // Enabled by default in production only, so local dev stays unthrottled.
  // Tight windows on the credential/OTP endpoints to slow brute-force.
  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      // Password-reset mail costs us a send and lands in someone's inbox, so it
      // is throttled harder than ordinary auth traffic.
      "/request-password-reset": { window: 60, max: 3 },
      "/two-factor/*": { window: 60, max: 5 },
    },
  },
  plugins: [
    twoFactor({
      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          await sendMail({
            to: user.email,
            subject: "Kode Verifikasi Login — IntelliBase AI",
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#f9fafb;">
                <div style="background:white;border-radius:12px;padding:36px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                  <h2 style="color:#0d9488;margin:0 0 6px;">IntelliBase AI</h2>
                  <h3 style="color:#111827;margin:0 0 20px;">Kode Verifikasi Login</h3>
                  <p style="color:#374151;">Halo <strong>${user.name}</strong>,</p>
                  <p style="color:#374151;">Gunakan kode berikut untuk menyelesaikan login Anda:</p>
                  <div style="text-align:center;margin:28px 0;">
                    <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0d9488;">${otp}</span>
                  </div>
                  <p style="color:#6b7280;font-size:13px;">Kode ini berlaku selama <strong>3 menit</strong>. Jangan bagikan kode ini kepada siapapun.</p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                  <p style="color:#9ca3af;font-size:12px;text-align:center;">© 2026 IntelliBase AI</p>
                </div>
              </div>
            `,
          });
        },
      },
    }),
  ],
});
