import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { authEmail } from "@/lib/email-template";

const appUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Origins allowed to make authenticated calls, which is a CSRF fence rather
 * than a convenience list: better-auth refuses any request whose `Origin` is
 * not in here, so the shorter this is, the better.
 *
 * It used to be exactly `[appUrl]`, and that made sign-in impossible on every
 * Vercel preview deployment. A preview is served from its own hostname
 * (`<project>-git-<branch>-<team>.vercel.app`), never from BETTER_AUTH_URL, so
 * the browser's Origin never matched and the request was rejected before any
 * password was checked — which surfaces in the UI as the login page's generic
 * "Terjadi kesalahan", because a rejected request is indistinguishable from a
 * dead network to the client. Nobody noticed because previews were never
 * signed into until there was a feature that had to be previewed signed in.
 *
 * The two additions are safe to trust because Vercel sets them, not the caller:
 * they are build-time environment variables of our own deployment, not headers
 * a request can carry. `VERCEL_URL` is the immutable per-deployment hostname;
 * `VERCEL_BRANCH_URL` is the stable alias that follows a branch's newest
 * deployment, which is the one a person actually opens from a pull request.
 *
 * What this deliberately does NOT do is trust `*.vercel.app`, or reflect the
 * request's own Origin back as trusted. Either would hand every other project
 * on the platform a working CSRF path into this one.
 */
const trustedOrigins = [
  appUrl,
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
];

export const auth = betterAuth({
  baseURL: appUrl,
  trustedOrigins,
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
    // A signed copy of the session lives in a second cookie so getSession()
    // does not pay a database round trip on every request. The cost of that
    // optimisation is that the copy is *trusted*: while it is valid,
    // better-auth returns it and never reads the session table (see the
    // early return in its api/routes/session.mjs). Deleting a session row —
    // which is what revocation is — therefore changes nothing until the copy
    // expires.
    //
    // This was seven days, which is how long a revoked session stayed usable.
    // The admin password reset in @/app/api/admin/users/[id]/reset-password
    // deletes every session the employee has and mails them "you have been
    // signed out on every device"; that sentence was false for a week. It is
    // the one button reached for when an account is believed to be
    // compromised, so it is exactly the case where a week of grace goes to
    // whoever took the account.
    //
    // Five minutes is better-auth's own default and the bound on how long a
    // revocation can go unnoticed. It costs one session read per user per
    // five minutes, which is the price of revocation meaning anything.
    //
    // Note this only ever governed *session* revocation. Role, company and
    // account deletion are read fresh from the users row by @/lib/auth-guard
    // on every request, so a demotion or an offboarding has always taken
    // effect immediately, cache or no cache.
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
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
