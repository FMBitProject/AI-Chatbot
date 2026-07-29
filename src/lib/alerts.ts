import { sendMail } from "@/lib/mail";
import { isRateLimited, recordFailure } from "@/lib/rate-limit";

// Where operational alerts go. Unset means log-only, which is what local and
// preview deployments want — an alert is never a reason for a payment route to
// behave differently.
const ALERT_TO = process.env.ALERT_EMAIL;

// One mail per subject key per window. A chargeback surfaces again on every
// "Cek Status" click, and forty copies of the same alert is how an inbox learns
// to ignore them. Per server instance and best-effort, like every other bucket
// in ./rate-limit — the point is to blunt a burst, not to guarantee exactly one.
const ALERT_DEDUPE = { max: 1, windowMs: 6 * 60 * 60 * 1000 };

// Takes unknown, not string: the values ultimately come from a cast Midtrans
// body, so the compile-time type is a promise the runtime has not made. A
// non-string here must degrade to its stringified form, never to a TypeError —
// alertOps documents that it does not throw, and its callers rely on that to
// keep a payment response's status code intact.
function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Raises something a human needs to look at: money reversed, an amount that did
 * not match, a notification we could not make sense of.
 *
 * Always logs, mails only when ALERT_EMAIL is configured, and never throws or
 * rejects — callers are payment paths in the middle of settling an order, and an
 * undelivered alert must not turn into a failed payment. `await` it anyway so
 * the send is not left dangling when the serverless function is frozen.
 *
 * `dedupeKey` should identify the situation, not the moment — an order id and
 * the kind of problem, so repeats of the same event collapse.
 */
export async function alertOps(opts: {
  dedupeKey: string;
  subject: string;
  details: Record<string, string>;
}): Promise<void> {
  const summary = Object.entries(opts.details)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.error(`[alert] ${opts.subject} ${summary}`);

  if (!ALERT_TO) return;
  // Check-then-record rather than consume-up-front: the slot must only be spent
  // on a mail that actually went out. Consuming before the send meant a Resend
  // outage burned the window and the next occurrence of the same problem —
  // possibly hours later, with Resend healthy again — was silently dropped.
  if (isRateLimited(`alert:${opts.dedupeKey}`, ALERT_DEDUPE)) return;

  const rows = Object.entries(opts.details)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${escapeHtml(k)}</b></td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("");

  try {
    await sendMail({
      to: ALERT_TO,
      subject: `[IntelliBase] ${opts.subject}`,
      html: `<p>${escapeHtml(opts.subject)}</p><table>${rows}</table>`,
    });
    recordFailure(`alert:${opts.dedupeKey}`, ALERT_DEDUPE);
  } catch (err) {
    // sendMail already logged the delivery failure; swallow it so the payment
    // path continues. The console.error above is the fallback record.
    console.error(`[alert] Could not deliver alert "${opts.subject}":`, err);
  }
}
