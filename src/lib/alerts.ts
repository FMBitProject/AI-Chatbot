import { sendMail } from "@/lib/mail";

// Where operational alerts go. Unset means log-only, which is what local and
// preview deployments want — an alert is never a reason for a payment route to
// behave differently.
const ALERT_TO = process.env.ALERT_EMAIL;

// How long the same alert stays quiet after one copy was delivered. A chargeback
// surfaces again on every "Cek Status" click, and forty copies of the same alert
// is how an inbox learns to ignore them.
const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;

// How long it stays quiet after a *failed* delivery. Short on purpose: a Resend
// outage must not swallow the alert for the full window (the problem is still
// there when mail recovers), but retrying on every single occurrence would hammer
// a service that is already struggling — and each attempt costs the payment
// route the timeout below.
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

// Alert sends sit on a payment route's response path, so they get a tighter
// bound than @/lib/mail's default.
const SEND_TIMEOUT_MS = 5_000;

// Keys are order ids and fixed strings, so this stays small in normal operation.
// The bound is for the pathological case where a flood of distinct orders all
// fail at once.
const MAX_KEYS = 500;

/** Alert key -> epoch ms until which it stays quiet. */
const quietUntil = new Map<string, number>();

function sweep(now: number) {
  if (quietUntil.size < MAX_KEYS) return;
  for (const [key, until] of quietUntil) {
    if (until <= now) quietUntil.delete(key);
  }
}

/**
 * Reserves the right to send `key`, returning the moment the reservation runs
 * out — or null when a recent send already covers it.
 *
 * The reservation is written before the caller awaits anything. That matters:
 * checking and then recording after the send let two concurrent callers both
 * pass the check and both send, which is the race this replaces. Nothing here
 * yields, so within one instance the claim is atomic.
 */
function claimQuietSlot(key: string, windowMs: number): number | null {
  const now = Date.now();
  sweep(now);
  const until = quietUntil.get(key);
  if (until !== undefined && until > now) return null;
  const claimedUntil = now + windowMs;
  quietUntil.set(key, claimedUntil);
  return claimedUntil;
}

function escapeHtml(value: unknown): string {
  // String(), not a template literal or a `string` parameter: the values
  // ultimately come from a cast Midtrans body, so the compile-time type is a
  // promise the runtime has not made. A non-string must degrade to its
  // stringified form, never to a TypeError — alertOps documents that it does
  // not throw, and its callers rely on that to keep a payment response's status
  // code intact.
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
 * the send is not left dangling when the serverless function is frozen; the
 * wait is bounded by SEND_TIMEOUT_MS.
 *
 * `dedupeKey` should identify the situation, not the moment — an order id and
 * the kind of problem, so repeats of the same event collapse. `windowMs`
 * overrides how long that collapsing lasts: a per-order problem can stay quiet
 * for hours, but a systemic one wants to speak up again sooner.
 *
 * Deduplication is per server instance and best-effort, like every other
 * in-memory bucket here — the point is to blunt a burst, not to guarantee
 * exactly one mail.
 */
export async function alertOps(opts: {
  dedupeKey: string;
  subject: string;
  details: Record<string, string>;
  windowMs?: number;
}): Promise<void> {
  const summary = Object.entries(opts.details)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.error(`[alert] ${opts.subject} ${summary}`);

  if (!ALERT_TO) return;

  const key = `alert:${opts.dedupeKey}`;
  const claimedUntil = claimQuietSlot(key, opts.windowMs ?? DEFAULT_WINDOW_MS);
  if (claimedUntil === null) return;

  const rows = Object.entries(opts.details)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${escapeHtml(k)}</b></td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`)
    .join("");

  try {
    await sendMail(
      {
        to: ALERT_TO,
        subject: `[IntelliBase] ${opts.subject}`,
        html: `<p>${escapeHtml(opts.subject)}</p><table>${rows}</table>`,
      },
      { timeoutMs: SEND_TIMEOUT_MS },
    );
  } catch (err) {
    // Nothing was delivered, so hold the slot only long enough to back off
    // rather than for the full window. Capped at the window we claimed, so a
    // caller passing a window shorter than the backoff cannot end up quieter
    // for having failed.
    quietUntil.set(key, Math.min(Date.now() + FAILURE_BACKOFF_MS, claimedUntil));
    // sendMail already logged the delivery failure; swallow it so the payment
    // path continues. The console.error above is the fallback record.
    console.error(`[alert] Could not deliver alert "${opts.subject}":`, err);
  }
}
