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

// Keys were order ids and fixed strings when this was written, so it stayed
// small on its own. It is no longer only that: /api/leads is public and keys its
// alerts by the submitted address, which means a stranger chooses them.
const MAX_KEYS = 500;

/** Alert key -> epoch ms until which it stays quiet. */
const quietUntil = new Map<string, number>();

function sweep(now: number) {
  if (quietUntil.size < MAX_KEYS) return;
  for (const [key, until] of quietUntil) {
    if (until <= now) quietUntil.delete(key);
  }
  // Expiry alone was never a bound. Entries live for the quiet window — six
  // hours by default — so a burst of distinct keys inside one window leaves
  // nothing to expire, the loop above deletes nothing, and the map grows for as
  // long as the burst lasts. Evicting the oldest is what makes MAX_KEYS an
  // actual ceiling; Map iterates in insertion order, so this drops the entries
  // whose quiet window is closest to running out anyway. The cost of dropping
  // one early is a duplicate alert, which is the right way to be wrong.
  if (quietUntil.size <= MAX_KEYS) return;
  for (const key of quietUntil.keys()) {
    if (quietUntil.size <= MAX_KEYS) break;
    quietUntil.delete(key);
  }
}

// A ceiling on how many alerts may actually be *sent* in an hour, across every
// key. Deduplication does not bound anything on its own: it collapses repeats
// of one key, so a thousand distinct keys are a thousand mails no matter how
// well it works. That was safe while every caller was a payment path reached by
// a Midtrans webhook or a signed-in admin, and stopped being safe the moment a
// public form could name the key.
//
// Opt-in per call rather than global, so the payment alerts this file was built
// for keep behaving exactly as they did — an alert about money must not be
// suppressed because a spam run used up a shared budget earlier in the hour.
const BUDGET_WINDOW_MS = 60 * 60 * 1000;

/** Budget name -> { count, resetAt }. */
const budgets = new Map<string, { count: number; resetAt: number }>();

/**
 * Spends one unit of a named hourly budget.
 *
 * Returns false when the budget for this window is gone, which the caller reads
 * as "log it, do not mail it" — the console.error in alertOps has already run by
 * then, so a suppressed alert is still recorded where the platform can see it.
 */
function spendBudget(name: string, max: number): boolean {
  const now = Date.now();
  const b = budgets.get(name);
  if (!b || b.resetAt <= now) {
    budgets.set(name, { count: 1, resetAt: now + BUDGET_WINDOW_MS });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
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
  /**
   * Cap sends under a shared named budget, `max` per hour.
   *
   * For callers whose dedupe key is not fully under our control — today that is
   * the public lead form, whose key is whatever address a visitor typed. Omit it
   * and nothing is capped, which is what every payment caller wants: an alert
   * about money should not lose to a budget somebody else spent.
   *
   * A refused send is still logged by the console.error above, so exceeding the
   * budget costs the email, never the record.
   */
  budget?: { name: string; max: number };
}): Promise<void> {
  const summary = Object.entries(opts.details)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.error(`[alert] ${opts.subject} ${summary}`);

  if (!ALERT_TO) return;

  const key = `alert:${opts.dedupeKey}`;
  const claimedUntil = claimQuietSlot(key, opts.windowMs ?? DEFAULT_WINDOW_MS);
  if (claimedUntil === null) return;

  // After the quiet slot, not before: a call that was going to be deduped
  // anyway must not spend budget, or a page being refreshed would exhaust the
  // hour without a single mail being sent.
  if (opts.budget && !spendBudget(opts.budget.name, opts.budget.max)) {
    console.error(`[alert] Budget "${opts.budget.name}" spent for this hour; not mailing: ${opts.subject}`);
    return;
  }

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
