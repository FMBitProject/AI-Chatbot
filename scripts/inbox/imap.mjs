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
import { createHash } from "crypto";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { requireEnv, readEnv } from "./env.mjs";

// How much of a body reaches the model. A long forwarded thread adds tokens
// without adding intent — the question being asked is essentially always in the
// first screenful.
const MAX_BODY_CHARS = 4000;

/**
 * The address replies are sent *from*, which is not necessarily the IMAP login.
 *
 * These were one value until an IMAP login that isn't an email address (some
 * providers use a bare username) turned `split("@")[1]` into undefined and took
 * the loop guard — the rule that stops the bot answering its own mail — down
 * with it. Separate now, and validated here rather than at the point of use, so
 * a misconfiguration is a sentence instead of a TypeError.
 */
export function inboxAddress() {
  const address = readEnv("INBOX_FROM") ?? requireEnv("INBOX_IMAP_USER");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    console.error(`Alamat pengirim "${address}" bukan alamat email yang sah.`);
    console.error(`Login IMAP Anda bukan alamat email? Isi INBOX_FROM di .env.local.`);
    process.exit(2);
  }
  return address;
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
  // The likeliest first-run failure by a wide margin — wrong host, wrong port,
  // or a password the panel shows once. An imapflow stack trace names none of
  // those; requireEnv already sets the standard for what a config error should
  // read like, and a connection error deserves the same treatment.
  try {
    await client.connect();
  } catch (err) {
    console.error(`Gagal terhubung ke IMAP: ${err.message}`);
    console.error(`Cek INBOX_IMAP_HOST / INBOX_IMAP_PORT / INBOX_IMAP_USER / INBOX_IMAP_PASS di .env.local.`);
    console.error(`Detail konfigurasi ada di panel Hostinger → Email → Konfigurasi.`);
    process.exit(2);
  }
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
  const path = await findMailbox(client, "\\Drafts", /^(INBOX[./])?drafts$/i);
  if (path) return path;
  const list = await client.list();
  throw new Error(
    `Folder Drafts tidak ditemukan. Folder yang ada: ${list.map((b) => b.path).join(", ")}`,
  );
}

/** Same lookup, returning null instead of throwing — see findDraftsMailbox. */
async function findMailbox(client, specialUse, namePattern) {
  const list = await client.list();
  return list.find((box) => box.specialUse === specialUse)?.path
    ?? list.find((box) => namePattern.test(box.path))?.path
    ?? null;
}

// Everything a mail client might stack in front of a subject. Stripped so the
// same thread compares equal no matter who forwarded it where.
const STRIP_PREFIXES = /^\s*((re|fwd|fw|bls|balasan)\s*:\s*)+/i;

// The narrower set that means "this message answers another one". Forwards are
// deliberately absent: forwarding someone's email to a colleague is not a reply
// to them, and it goes to a different address anyway.
const REPLY_PREFIXES = /^\s*(re|bls|balasan)\s*:/i;

/**
 * Strips every "Re:"/"Fwd:" prefix, so a subject can be compared across a thread.
 */
export function bareSubject(subject) {
  return String(subject ?? "").replace(STRIP_PREFIXES, "").trim().toLowerCase();
}

/** Whether this subject is itself an answer to something, not an opening message. */
export function isReplySubject(subject) {
  return REPLY_PREFIXES.test(String(subject ?? ""));
}

/**
 * Which incoming emails already have an answer — read from the mailbox itself.
 *
 * state.json cannot be the only answer to "did we already reply to this?" once
 * the bot runs anywhere but this machine: a scheduled CI run gets a fresh
 * container every time, the file is gone, and every run writes another draft
 * for the same email. The mailbox, unlike a local file, is the one place both
 * the bot and you already agree on.
 *
 * Reads Drafts *and* Sent, which buys something state.json never could: if you
 * answered someone by hand, the bot now knows and stays out of the way. That
 * used to produce a redundant draft under a reply you had already sent.
 *
 * Two keys, because not every email carries a Message-ID (see toMessage). The
 * first is exact. The second — recipient plus subject with the Re: stripped —
 * covers the rest, and is what our own draft would look like from the outside.
 *
 * Envelope-only fetch: no bodies are downloaded, so this stays cheap even on a
 * mailbox with a busy Sent folder.
 */
export async function answeredKeys(client, { days }) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const byMessageId = new Set();
  const byRecipientSubject = new Set();

  const draftsPath = await findMailbox(client, "\\Drafts", /^(INBOX[./])?drafts$/i);
  const sentPath = await findMailbox(client, "\\Sent", /^(INBOX[./])?sent(\s?(items|mail))?$/i);

  // Said out loud rather than filtered away in silence. Without Sent we still
  // dedupe correctly against our own drafts; what is lost is "you already
  // replied by hand, so stay out of the way" — a capability disappearing
  // quietly is how you end up trusting something that stopped working.
  if (!sentPath) {
    console.warn("  ⚠ folder Sent tidak ditemukan — balasan yang Anda tulis sendiri tidak akan terdeteksi.");
  }

  const scan = async (path) => {
    const lock = await client.getMailboxLock(path);
    try {
      for await (const msg of client.fetch({ since }, { uid: true, envelope: true })) {
        const env = msg.envelope ?? {};
        if (env.inReplyTo) byMessageId.add(env.inReplyTo);

        // Only messages that are themselves replies may contribute the fallback
        // key, and this condition is the whole point of it.
        //
        // Without it the key was built from every recent sent message, including
        // outbound cold outreach — so "Perkenalan IntelliBase" sent to a
        // prospect produced exactly the key their reply "Re: Perkenalan
        // IntelliBase" would later look up, and the reply was skipped as already
        // answered. Silently, with no draft and no log line, for the one class
        // of email worth the most.
        if (!isReplySubject(env.subject)) continue;
        const to = env.to?.[0]?.address?.toLowerCase();
        const subject = bareSubject(env.subject);
        if (to && subject) byRecipientSubject.add(`${to}|${subject}`);
      }
    } finally {
      lock.release();
    }
  };

  // Drafts is load-bearing: without it we cannot tell our own previous drafts
  // apart and would append another every run, so a failure there is fatal.
  if (draftsPath) await scan(draftsPath);

  // Sent is a nicety. A mailbox that lists but refuses SELECT (\Noselect, or a
  // permissions quirk) must not take the whole run down for it.
  if (sentPath) {
    try {
      await scan(sentPath);
    } catch (err) {
      console.warn(`  ⚠ folder Sent "${sentPath}" tidak bisa dibaca (${err.message}) — lanjut tanpa itu.`);
    }
  }

  return { byMessageId, byRecipientSubject };
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
 * Reads headers off `headerLines` — the raw `Key: value` lines — rather than off
 * the parsed `headers` Map.
 *
 * The Map looks like the obvious source and quietly is not: mailparser folds
 * every `List-*` header into a single structured `list` entry, so
 * `headers.get("list-unsubscribe")` returns undefined on a message that plainly
 * carries the header. The newsletter guard was written against that Map and
 * therefore never fired once. headerLines is what actually arrived, is already
 * lower-cased, and is immune to whatever mailparser decides to restructure next.
 *
 * Repeated headers are joined rather than overwritten, so a check cannot be
 * defeated by sending the same header twice.
 */
function rawHeaders(parsed) {
  const map = new Map();
  for (const { key, line } of parsed.headerLines ?? []) {
    const value = line.slice(line.indexOf(":") + 1).trim();
    map.set(key, map.has(key) ? `${map.get(key)} ${value}` : value);
  }
  return map;
}


// Addresses that are a role, not a person. Greeting one by name reads as a
// mail-merge that misfired, which is worse than not greeting at all.
const ROLE_LOCALPARTS = new Set([
  "info", "sales", "support", "admin", "contact", "hello", "halo", "cs",
  "marketing", "hr", "hrd", "finance", "billing", "office", "team", "care",
  "noreply", "no-reply", "help", "inquiry", "enquiry", "pengaduan", "layanan",
]);

// Words that mean the display name is an organisation rather than a human.
const ORG_WORDS = /\b(pt|cv|ud|tbk|inc|ltd|llc|gmbh|corp|team|tim|support|sales|marketing|official|admin|klinik|rumah sakit|rs|apotek|yayasan)\b/i;

// Titles are not names. "Dr. Sari" greeted as "Halo Dr," is worse than no
// greeting, and Indonesian business mail is full of these.
const TITLES = /^(dr|drg|dra|ir|prof|h|hj|bapak|ibu|pak|bu|mr|mrs|ms|sdr|sdri)\.?$/i;

/**
 * The name to greet the sender by, or null when there isn't a trustworthy one.
 *
 * Three tiers, and the third one is the interesting decision. A display name is
 * used when it looks like a person wrote it. The local part of the address is
 * used only when it too looks like a name. Everything else returns null, and the
 * draft opens with a plain "Halo," — because the failure modes are not
 * symmetric: no greeting reads as slightly brisk, while "Halo renfael6," reads
 * as a bot that could not be bothered, to the one prospect who wrote in.
 *
 * Deliberately in code rather than in the prompt. "Sapa dengan nama pengirim
 * kalau namanya diketahui" is an instruction a model has to *judge*, and it will
 * cheerfully judge "SuperCreede" to be a first name.
 */
export function senderName({ name = "", address = "" } = {}) {
  const localPart = (address.split("@")[0] ?? "").toLowerCase();
  if (ROLE_LOCALPARTS.has(localPart)) return null;

  const display = name.replace(/["']/g, "").trim();
  // An organisation in the display name settles it for the whole sender. Falling
  // through to the local part here turned "PT Sehat Sentosa" <kontak@…> into
  // "Halo Kontak," — the address of an organisation is not a person either.
  if (display && ORG_WORDS.test(display)) return null;

  if (display && !display.includes("@")) {
    const first = display.split(/[\s,]+/).filter((w) => !TITLES.test(w))[0] ?? "";
    // Rejects handles: digits ("budi123"), and internal capitals the way
    // "SuperCreede" and "IntelliBase" have them. A real mononym — "Suparman" —
    // survives both, which is the case worth protecting in Indonesia.
    const handleLike = /\d/.test(first) || /.[A-Z]/.test(first.slice(1));
    if (!handleLike && first.length >= 2 && first.length <= 20 && /^[\p{L}'-]+$/u.test(first)) {
      return capitalise(first);
    }
  }

  // Tier three: the part before the @, but only when it reads like a name.
  // "budi.santoso" -> "Budi". "renfael6" -> null, because of the digit.
  const candidate = localPart.split(/[._-]/)[0];
  if (candidate.length >= 3 && candidate.length <= 20 && /^[a-z]+$/.test(candidate)) {
    return capitalise(candidate);
  }
  return null;
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Turns a parsed email into the shape the rest of the pipeline works with.
 *
 * Exported because this mapping is where the newsletter guard broke: the rule
 * layer was covered by tests, its input was not. triage.test.mjs now drives real
 * MIME through this function, so a header the parser renames again fails the
 * test rather than silently disabling a rule.
 */
export function toMessage(parsed, uid = null) {
  const h = rawHeaders(parsed);
  const header = (name) => h.get(name) ?? "";
  const body = stripQuoted(parsed.text ?? "");
  const from = parsed.from?.value?.[0] ?? { address: "", name: "" };
  const subject = parsed.subject ?? "(tanpa subjek)";

  return {
    uid,
    messageId: parsed.messageId ?? null,
    // What state.mjs dedupes on. Message-ID is the right key when it exists,
    // but it is not mandatory and contact-form mailers routinely omit it — and
    // a message with no key was silently never recorded as handled, so every
    // run wrote it another draft. The fallback hashes what the sender did give
    // us, which is stable across runs in a way the IMAP UID is not.
    key: parsed.messageId ?? `sha1:${createHash("sha1")
      .update(`${from.address} ${subject} ${parsed.date?.toISOString() ?? ""} ${body.slice(0, 200)}`)
      .digest("hex")}`,
    from,
    // Resolved here so the drafting prompt receives a decision, not a judgement
    // call — see senderName.
    greetName: senderName(from),
    subject,
    date: parsed.date ?? null,
    body: body.slice(0, MAX_BODY_CHARS),
    truncated: body.length > MAX_BODY_CHARS,
    // Only the headers triage actually reads. Passing the whole set along would
    // mean the rest of the pipeline could reach into anything.
    headers: {
      autoSubmitted: header("auto-submitted"),
      precedence: header("precedence"),
      listId: header("list-id"),
      listUnsubscribe: header("list-unsubscribe"),
      autoreply: header("x-autoreply") || header("x-autorespond") || header("x-auto-response-suppress"),
    },
    // Carried so the reply can be threaded; see buildDraft.
    references: parsed.references ? [].concat(parsed.references).join(" ") : "",
  };
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
      // One unparseable message must not cost the whole run. Parsing sits
      // outside draft.mjs's per-message catch, so without this a single
      // malformed email in the inbox stops every other email from being
      // looked at — the bot appears dead until that message is deleted by hand.
      try {
        messages.push(toMessage(await simpleParser(msg.source), msg.uid));
      } catch (err) {
        console.error(`  ✗ email UID ${msg.uid} gagal di-parse, dilewati: ${err.message}`);
      }
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
