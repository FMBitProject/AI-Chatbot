import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { Resend } from "resend";

const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const resend = new Resend(process.env.RESEND_API_KEY);

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
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: "onboarding@resend.dev",
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
});
