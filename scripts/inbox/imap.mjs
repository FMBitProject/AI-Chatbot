// Everything that talks to the mailbox.
//
// Two deliberate absences, both load-bearing:
//
//   1. No SMTP anywhere in this module, or anywhere in scripts/inbox/. The bot
//      cannot send mail because it holds no credential that can send mail —
//      "it only writes drafts" is a property of the code, not a promise about
//      the prompt. Adding a transport here would quietly remove the safety the
//      whole design rests on.
//   2. Nothing is ever marked \Seen. Fetching with `seen: false` would be the
//      obvious way to find new mail, but IMAP servers flip that flag as a side
//      effect of reading the body, so the bot would silently mark your unread
//      mail as read. We search by date instead and dedupe in state.mjs.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { requireEnv, readEnv } from "./env.mjs";

// How much of a body reaches the model. A long forwarded thread adds tokens
// without adding intent — the question being asked is essentially always in the
// first screenful.
const MAX_BODY_CHARS = 4000;

export function inboxAddress() {
  return requireEnv("INBOX_IMAP_USER");
}

export async function connect() {
  const client = new ImapFlow({
    host: requireEnv("INBOX_IMAP_HOST"),
    port: Number(readEnv("INBOX_IMAP_PORT") ?? 993),
    secure: true,
    auth: { user: requireEnv("INBOX_IMAP_USER"), pass: requireEnv("INBOX_IMAP_PASS") },
    // The default logger prints every IMAP command as JSON, which buries the
    // script's own output. Errors still surface as thrown exceptions.
    logger: false,
  });
  await client.connect();
  return client;
}

/**
 * Finds the Drafts folder by its SPECIAL-USE flag rather than by name.
 *
 * Hardcoding "Drafts" works until it doesn't: the same mailbox is "Drafts" on
 * one provider, "INBOX.Drafts" on another, and localised on a third. A wrong
 * path makes append() create a *new top-level folder* with that name and drop
 * the draft into it, where nothing will ever look for it.
 */
export async function findDraftsMailbox(client) {
  const list = await client.list();
  const special = list.find((box) => box.specialUse === "\\Drafts");
  if (special) return special.path;
  const byName = list.find((box) => /^(INBOX[./])?drafts$/i.test(box.path));
  if (byName) return byName.path;
  throw new Error(
    `Folder Drafts tidak ditemukan. Folder yang ada: ${list.map((b) => b.path).join(", ")}`,
  );
}

/** Strips the quoted history so only what this person actually wrote is left. */
function stripQuoted(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    // Both the Indonesian and English forms Gmail/Outlook/Titan generate, plus
    // the Outlook separator that has no date in it at all.
    if (/^\s*(pada|on)\s+.{0,80}(menulis|wrote)\s*:?\s*$/i.test(line)) break;
    if (/^\s*-{2,}\s*(original message|pesan asli|forwarded message)\s*-{2,}/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Every message in the mailbox from the last `days` days, parsed.
 *
 * Bounded by date rather than fetching the whole mailbox: this runs on a
 * founder's real inbox with years of mail in it, and the only messages worth
 * looking at are the ones that arrived since the last run.
 */
export async function fetchRecent(client, { days }) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const messages = [];
  const lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch({ since }, { uid: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      const header = (name) => String(parsed.headers.get(name) ?? "");
      const body = stripQuoted(parsed.text ?? "");
      messages.push({
        uid: msg.uid,
        messageId: parsed.messageId ?? null,
        from: parsed.from?.value?.[0] ?? { address: "", name: "" },
        subject: parsed.subject ?? "(tanpa subjek)",
        date: parsed.date ?? null,
        body: body.slice(0, MAX_BODY_CHARS),
        truncated: body.length > MAX_BODY_CHARS,
        // Only the headers triage actually reads. Passing the whole Map along
        // would mean the rest of the pipeline could reach into anything.
        headers: {
          autoSubmitted: header("auto-submitted"),
          precedence: header("precedence"),
          listId: header("list-id"),
          listUnsubscribe: header("list-unsubscribe"),
          autoreply: header("x-autoreply") || header("x-autorespond") || header("x-auto-response-suppress"),
        },
        // Carried so the reply can be threaded; see buildDraft.
        references: parsed.references
          ? [].concat(parsed.references).join(" ")
          : "",
      });
    }
  } finally {
    lock.release();
  }
  return messages;
}

/**
 * Builds the RFC822 bytes of a reply that belongs to the original thread.
 *
 * In-Reply-To and References are what make a mail client show this as a reply
 * rather than as a new message that happens to start with "Re:". Without them
 * the draft opens detached from the conversation, and the recipient's client
 * files your answer somewhere other than the thread they asked in.
 */
export async function buildDraft({ to, from, subject, text, inReplyTo, references }) {
  const mail = new MailComposer({
    from,
    to,
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    text,
    // Invisible to the reader, but it means a draft can always be traced back to
    // this script — useful the first time one looks wrong and you need to know
    // whether you wrote it or the bot did.
    headers: { "X-IntelliBase-Draft": "scripts/inbox" },
    ...(inReplyTo ? { inReplyTo, references: `${references} ${inReplyTo}`.trim() } : {}),
  });
  return mail.compile().build();
}

/** Appends the built message to the Drafts folder, flagged as a draft. */
export async function appendDraft(client, mailboxPath, raw) {
  await client.append(mailboxPath, raw, ["\\Draft"]);
}
