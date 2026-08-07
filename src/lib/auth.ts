import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { authEmail } from "@/lib/email-template";

const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
      // Required by the twoFactor plugin below. This map is the adapter's whole
      // world: passing `schema` here disables the fallback to the full drizzle
      // schema, so a model missing from this list does not degrade — it throws
      // at the first query. That is exactly how 2FA shipped broken: the plugin
      // was registered, this entry was not, and every enable attempt 500'd
      // after the password check passed.
      twoFactor: schema.twoFactors,
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
