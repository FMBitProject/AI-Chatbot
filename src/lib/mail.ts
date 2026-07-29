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

// Deferring the constructor costs the fail-fast the old module-scope client
// gave us: without this warning a deployment missing the key boots clean and
// looks healthy, and the first sign of trouble is a user who never gets their
// verification mail. This project has shipped exactly that bug before.
if (!process.env.RESEND_API_KEY) {
  console.warn("[mail] RESEND_API_KEY is not set — every outgoing email will fail.");
}

// Must be an address on a domain verified at resend.com/domains. Resend's shared
// sandbox sender (onboarding@resend.dev) only ever delivers to the Resend
// account owner, which silently made every signup unusable: the account was
// created, the verification mail never arrived, and login stayed blocked on
// EMAIL_NOT_VERIFIED. Override with RESEND_FROM if the sending domain changes.
const MAIL_FROM = process.env.RESEND_FROM ?? "IntelliBase AI <noreply@intellibaseai.com>";

// The Resend SDK calls fetch() with no signal and Node's fetch has no useful
// default timeout, so without this a hung API can hold a request open until the
// platform kills the function. Generous by default; callers on a latency-
// sensitive path (see alertOps) pass something shorter.
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Every outgoing mail goes through here so a delivery failure is loud in the
 * Vercel logs and propagates to the caller, instead of disappearing and leaving
 * a user stranded with an account they can never verify.
 *
 * Lives here rather than in @/lib/auth so non-auth senders (see ./alerts) can
 * reuse the one verified sender configuration instead of redeclaring it.
 *
 * Rejects on a delivery error and on timeout. A timeout does not cancel the
 * underlying request — the SDK exposes no way to — so the mail may still go out
 * afterwards; what it bounds is how long the caller waits.
 */
export async function sendMail(
  opts: { to: string; subject: string; html: string },
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
) {
  const send = getResend().emails.send({ from: MAIL_FROM, ...opts });
  // Mark a late rejection as handled: once the timeout below wins the race,
  // nothing is awaiting `send` any more, and an unhandled rejection in a
  // serverless runtime can take the whole invocation down.
  send.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { error } = await Promise.race([
      send,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Email delivery timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    if (error) {
      console.error(`[mail] FAILED to=${opts.to} subject="${opts.subject}" from=${MAIL_FROM}:`, error);
      throw new Error(`Email delivery failed: ${error.message ?? "unknown error"}`);
    }
    console.log(`[mail] sent to=${opts.to} subject="${opts.subject}"`);
  } finally {
    clearTimeout(timer);
  }
}
