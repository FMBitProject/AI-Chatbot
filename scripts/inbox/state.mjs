// Which emails have already been handled.
//
// This is the only thing standing between "run the script twice" and "two
// identical drafts sitting in the Drafts folder", so it is written *before* the
// draft is appended, not after: a crash between the two leaves one email
// silently un-drafted, which you notice by reading your inbox. The other order
// leaves duplicates, which you notice by sending one of them.
//
// Keyed by Message-ID rather than IMAP UID. UIDs are per-mailbox and reset if a
// mailbox is ever recreated; Message-ID is assigned by the sender and stays the
// same no matter what happens on our side.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { ROOT } from "./env.mjs";

const STATE_PATH = join(ROOT, "scripts", "inbox", "state.json");

// Entries older than this are dropped when the file is written, so the state
// file cannot grow forever. Comfortably longer than the window draft.mjs
// searches (--days, default 3), which is what makes forgetting safe: an email
// old enough to be forgotten here is too old to be fetched again.
const KEEP_DAYS = 90;

export function loadState() {
  try {
    const raw = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    return raw && typeof raw === "object" && raw.handled ? raw : { handled: {} };
  } catch {
    // Missing or corrupt both mean the same thing operationally: we know of no
    // handled mail. A corrupt file costs at most one duplicate draft, which is
    // strictly better than refusing to run at all.
    return { handled: {} };
  }
}

/** Records one message as handled, with why, and persists immediately. */
export function markHandled(state, messageId, outcome) {
  if (!messageId) return;
  state.handled[messageId] = { at: new Date().toISOString(), outcome };
  saveState(state);
}

/**
 * Undoes a markHandled, for the one case that needs it: the draft was recorded
 * and then failed to reach the mailbox. Without this the email is remembered as
 * answered while nothing was ever written, and only --force would find it again.
 */
export function unmarkHandled(state, messageId) {
  if (!messageId || !state.handled[messageId]) return;
  delete state.handled[messageId];
  saveState(state);
}

export function isHandled(state, messageId) {
  return Boolean(messageId && state.handled[messageId]);
}

function saveState(state) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const handled = Object.fromEntries(
    Object.entries(state.handled).filter(([, v]) => {
      const t = Date.parse(v?.at ?? "");
      return Number.isNaN(t) || t >= cutoff;
    }),
  );
  state.handled = handled;
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify({ handled }, null, 2) + "\n");
}
