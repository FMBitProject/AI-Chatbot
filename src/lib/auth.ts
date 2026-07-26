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

// Auth mail goes out before anyone has told us which language they read: the
// language toggle lives in localStorage, which the server never sees. So every
// one of these is written twice, English first, rather than guessing wrong at
// the exact moment someone is trying to get into their account.
type Bilingual = { en: string; id: string };

function authEmail(opts: {
  heading: Bilingual;
  greetingName: string;
  body: Bilingual;
  action?: { url: string; label: Bilingual };
  code?: string;
  note: Bilingual;
}): string {
  // Only the wording repeats. The button and the OTP appear once, so nobody has
  // to wonder whether the second one is a different link or a different code.
  const words = (lang: "en" | "id") => `
    <h3 style="color:#111827;margin:0 0 12px;font-size:18px;">${opts.heading[lang]}</h3>
    <p style="color:#374151;line-height:1.6;margin:0 0 10px;">${lang === "en" ? "Hi" : "Halo"} <strong>${opts.greetingName}</strong>,</p>
    <p style="color:#374151;line-height:1.6;margin:0;">${opts.body[lang]}</p>
  `;

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#f9fafb;">
      <div style="background:white;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <h2 style="color:#0d9488;margin:0 0 24px;">IntelliBase AI</h2>
        ${words("en")}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        ${words("id")}
        ${opts.code ? `
          <div style="text-align:center;margin:32px 0;">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0d9488;">${opts.code}</span>
          </div>` : ""}
        ${opts.action ? `
          <div style="text-align:center;margin:32px 0;">
            <a href="${opts.action.url}" style="display:inline-block;background:#0d9488;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${opts.action.label.en} · ${opts.action.label.id}</a>
          </div>` : ""}
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 6px;">${opts.note.en}</p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${opts.note.id}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">© 2026 IntelliBase AI</p>
      </div>
    </div>
  `;
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
        subject: "Reset your password / Atur ulang kata sandi — IntelliBase AI",
        html: authEmail({
          heading: { en: "Reset your password", id: "Atur Ulang Kata Sandi" },
          greetingName: user.name,
          body: {
            en: "We received a request to reset the password for your account. Click below to choose a new one.",
            id: "Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda. Klik tombol di bawah untuk membuat kata sandi baru.",
          },
          action: { url, label: { en: "Reset password", id: "Atur Ulang Kata Sandi" } },
          note: {
            en: "This link is valid for 1 hour and can only be used once. If you didn't request it, ignore this email — your password stays unchanged.",
            id: "Link ini berlaku selama 1 jam dan hanya bisa dipakai sekali. Jika Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.",
          },
        }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your email / Verifikasi email — IntelliBase AI",
        html: authEmail({
          heading: { en: "Verify your email", id: "Verifikasi Email Anda" },
          greetingName: user.name,
          body: {
            en: "Thanks for signing up. Click below to verify your email and start using IntelliBase AI.",
            id: "Terima kasih telah mendaftar. Klik tombol di bawah untuk memverifikasi email Anda dan mulai menggunakan IntelliBase AI.",
          },
          action: { url, label: { en: "Verify email", id: "Verifikasi Email" } },
          note: {
            en: "This link is valid for 24 hours. If you didn't sign up for IntelliBase AI, you can ignore this email.",
            id: "Link ini berlaku selama 24 jam. Jika Anda tidak mendaftar di IntelliBase AI, abaikan email ini.",
          },
        }),
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
            subject: "Your login code / Kode login — IntelliBase AI",
            html: authEmail({
              heading: { en: "Your login code", id: "Kode Verifikasi Login" },
              greetingName: user.name,
              body: {
                en: "Use this code to finish signing in:",
                id: "Gunakan kode berikut untuk menyelesaikan login Anda:",
              },
              code: otp,
              note: {
                en: "The code is valid for 3 minutes. Never share it with anyone.",
                id: "Kode ini berlaku selama 3 menit. Jangan bagikan kode ini kepada siapa pun.",
              },
            }),
          });
        },
      },
    }),
  ],
});
