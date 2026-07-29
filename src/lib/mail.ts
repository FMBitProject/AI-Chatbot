import { Resend } from "resend";

// Constructed lazily, not at module scope: the Resend constructor throws when
// RESEND_API_KEY is unset, and this module is imported (via @/lib/alerts) by the
// payment routes. An import-time throw there would take payments down over a
// missing *email* key. Deferring it moves the failure to the actual send, where
// every caller already handles it — alertOps swallows it, auth propagates it.
let _resend: Resend | null = null;
function getResend(): Resend {
  return (_resend ??= new Resend(process.env.RESEND_API_KEY));
}

// Must be an address on a domain verified at resend.com/domains. Resend's shared
// sandbox sender (onboarding@resend.dev) only ever delivers to the Resend
// account owner, which silently made every signup unusable: the account was
// created, the verification mail never arrived, and login stayed blocked on
// EMAIL_NOT_VERIFIED. Override with RESEND_FROM if the sending domain changes.
const MAIL_FROM = process.env.RESEND_FROM ?? "IntelliBase AI <noreply@intellibaseai.com>";

/**
 * Every outgoing mail goes through here so a delivery failure is loud in the
 * Vercel logs and propagates to the caller, instead of disappearing and leaving
 * a user stranded with an account they can never verify.
 *
 * Lives here rather than in @/lib/auth so non-auth senders (see ./alerts) can
 * reuse the one verified sender configuration instead of redeclaring it.
 */
export async function sendMail(opts: { to: string; subject: string; html: string }) {
  const { error } = await getResend().emails.send({ from: MAIL_FROM, ...opts });
  if (error) {
    console.error(`[mail] FAILED to=${opts.to} subject="${opts.subject}" from=${MAIL_FROM}:`, error);
    throw new Error(`Email delivery failed: ${error.message ?? "unknown error"}`);
  }
  console.log(`[mail] sent to=${opts.to} subject="${opts.subject}"`);
}
