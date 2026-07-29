import { sendMail } from "@/lib/mail";
import { consumeRateLimit } from "@/lib/rate-limit";

// Where operational alerts go. Unset means log-only, which is what local and
// preview deployments want — an alert is never a reason for a payment route to
// behave differently.
const ALERT_TO = process.env.ALERT_EMAIL;

// One mail per subject key per window. A chargeback surfaces again on every
// "Cek Status" click, and forty copies of the same alert is how an inbox learns
// to ignore them. Per server instance and best-effort, like every other bucket
// in ./rate-limit — the point is to blunt a burst, not to guarantee exactly one.
const ALERT_DEDUPE = { max: 1, windowMs: 6 * 60 * 60 * 1000 };

function escapeHtml(value: string): string {
  return value
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
  if (!consumeRateLimit(`alert:${opts.dedupeKey}`, ALERT_DEDUPE).ok) return;

  const rows = Object.entries(opts.details)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${escapeHtml(k)}</b></td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("");

  try {
    await sendMail({
      to: ALERT_TO,
      subject: `[IntelliBase] ${opts.subject}`,
      html: `<p>${escapeHtml(opts.subject)}</p><table>${rows}</table>`,
    });
  } catch (err) {
    // sendMail already logged the delivery failure; swallow it so the payment
    // path continues. The console.error above is the fallback record.
    console.error(`[alert] Could not deliver alert "${opts.subject}":`, err);
  }
}
