// Writes draft replies into the Drafts folder of hello@intellibaseai.com.
//
// Reads the inbox, throws away everything that isn't a person asking something,
// writes an answer from the facts in scripts/content/brand-facts.mjs, checks that
// answer against the same claim linter the social packs go through, and leaves it
// as a draft for you to read and send.
//
// It cannot send. See the header of ./imap.mjs for why that is structural.
//
//   node scripts/inbox/draft.mjs --triage-only   # pilah saja, tidak menulis apa pun
//   node scripts/inbox/draft.mjs --dry-run       # tulis draft ke layar + out/, jangan sentuh mailbox
//   node scripts/inbox/draft.mjs                 # tulis draft ke folder Drafts

import { generateText } from "ai";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readEnv, ROOT } from "./env.mjs";
import { resolveModel } from "../content/provider.mjs";
import { lintText, splitProblems, formatProblems } from "../content/lint.mjs";
import { connect, fetchRecent, findDraftsMailbox, buildDraft, appendDraft, inboxAddress } from "./imap.mjs";
import { ruleSkip, classify, skipDomains, DRAFTABLE } from "./triage.mjs";
import { buildReplyPrompt, signature } from "./reply-facts.mjs";
import { loadState, isHandled, markHandled } from "./state.mjs";

const OUT_DIR = join(ROOT, "scripts", "inbox", "out");

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const num = (n, fallback) => {
  const i = args.indexOf(`--${n}`);
  if (i === -1) return fallback;
  const v = Number(args[i + 1]);
  if (!Number.isFinite(v) || v <= 0) {
    console.error(`--${n} harus angka positif, dapat "${args[i + 1]}"`);
    process.exit(2);
  }
  return v;
};

const TRIAGE_ONLY = has("triage-only");
const DRY_RUN = has("dry-run");
const FORCE = has("force");
const DAYS = num("days", 3);
const LIMIT = num("limit", 20);

// The inbox may run on a different provider than the weekly content pack — the
// content scripts only ever see our own marketing copy, this one sees other
// people's email. INBOX_PROVIDER/INBOX_MODEL win; without them it falls back to
// the content settings, and without those to Gemini's free tier.
const readModelEnv = (key) => {
  const alias = { CONTENT_PROVIDER: "INBOX_PROVIDER", CONTENT_MODEL: "INBOX_MODEL" }[key];
  return (alias ? readEnv(alias) : undefined) || readEnv(key);
};

function writeOut(name, contents) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, name);
  writeFileSync(path, contents);
  return path;
}

/** Filename-safe slug of a subject, so out/ stays browsable. */
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "tanpa-subjek";
}

// --- run --------------------------------------------------------------------
const ownDomain = inboxAddress().split("@")[1].toLowerCase();
const skipList = skipDomains();
const state = loadState();
const tally = { dilihat: 0, aturan: 0, abaikan: 0, manusia: 0, ditahan: 0, draft: 0, gagal: 0 };

// Needed even for --triage-only: the classifier is a model call too.
const { model, providerName, modelId } = resolveModel(readModelEnv);
console.log(`Model: ${providerName}/${modelId}`);

const client = await connect();
let draftsPath = null;
try {
  const messages = await fetchRecent(client, { days: DAYS });
  console.log(`${messages.length} email dalam ${DAYS} hari terakhir di ${inboxAddress()}\n`);

  for (const msg of messages) {
    if (tally.draft + tally.ditahan >= LIMIT) {
      console.log(`\n(berhenti di --limit ${LIMIT})`);
      break;
    }
    if (!FORCE && isHandled(state, msg.messageId)) continue;
    tally.dilihat++;

    const who = `${msg.from.name || msg.from.address} <${msg.from.address}>`;
    const head = `${msg.date?.toISOString().slice(0, 16).replace("T", " ") ?? "?"}  ${who}\n  "${msg.subject}"`;

    // Layer 1: no model involved, so this mail never leaves the machine.
    const skipReason = ruleSkip(msg, { ownDomain, skipDomains: skipList });
    if (skipReason) {
      console.log(`${head}\n  ⏭  lewati — ${skipReason}\n`);
      tally.aturan++;
      markHandled(state, msg.messageId, `lewati-aturan: ${skipReason}`);
      continue;
    }

    try {
      const triage = await classify(model, msg);
      console.log(`${head}\n  → ${triage.kategori}: ${triage.alasan}`);
      if (triage.pertanyaan.length) {
        console.log(`     tanya: ${triage.pertanyaan.join(" | ")}`);
      }

      if (!DRAFTABLE.has(triage.kategori)) {
        console.log(triage.kategori === "perlu-manusia"
          ? "  ✋ tidak didraft — jawab sendiri\n"
          : "  ⏭  tidak perlu balasan\n");
        tally[triage.kategori === "perlu-manusia" ? "manusia" : "abaikan"]++;
        if (!TRIAGE_ONLY) markHandled(state, msg.messageId, triage.kategori);
        continue;
      }

      if (TRIAGE_ONLY) {
        console.log("  (triage-only, draft dilewati)\n");
        continue;
      }

      const { text } = await generateText({
        model,
        system: buildReplyPrompt(),
        temperature: 0.4,
        prompt: `Balas email berikut.${msg.truncated ? " (Isi email dipotong karena panjang.)" : ""}

Dari: ${msg.from.name || ""} <${msg.from.address}>
Subjek: ${msg.subject}

${msg.body}`,
      });

      const body = `${text.trim()}\n\n${signature(readEnv)}\n`;

      // The same gate the weekly content pack passes, minus the one rule that
      // is wrong here — see lintText's `exclude` in scripts/content/lint.mjs.
      const problems = lintText(body, new Date(), { exclude: ["founder-voice"] });
      const { blocking, warnings } = splitProblems(problems);
      if (warnings.length) {
        console.log("  ⚠ kalimat menyangkal klaim (tidak memblokir):");
        console.log(formatProblems(warnings, "⚠"));
      }
      if (blocking.length) {
        const path = writeOut(
          `DITAHAN-${slug(msg.subject)}.txt`,
          `# DITAHAN — draft ini TIDAK masuk folder Drafts\n# Kepada: ${who}\n# Subjek: Re: ${msg.subject}\n\n${formatProblems(blocking)}\n\n---\n\n${body}`,
        );
        console.log(`  ✗ ditahan linter:\n${formatProblems(blocking)}\n  → ${path}\n`);
        tally.ditahan++;
        markHandled(state, msg.messageId, "ditahan-lint");
        continue;
      }

      if (DRY_RUN) {
        const path = writeOut(`DRAFT-${slug(msg.subject)}.txt`, `# Kepada: ${who}\n# Subjek: Re: ${msg.subject}\n\n${body}`);
        console.log(`  ✓ draft (dry-run, tidak dikirim ke mailbox) → ${path}\n`);
        console.log(body.split("\n").map((l) => `     ${l}`).join("\n") + "\n");
        tally.draft++;
        continue;
      }

      const raw = await buildDraft({
        to: msg.from.address,
        from: inboxAddress(),
        subject: msg.subject,
        text: body,
        inReplyTo: msg.messageId,
        references: msg.references,
      });

      // State first, mailbox second: a crash between the two costs one missing
      // draft, the other order costs a duplicate. See ./state.mjs.
      markHandled(state, msg.messageId, "draft");
      draftsPath ??= await findDraftsMailbox(client);
      await appendDraft(client, draftsPath, raw);
      console.log(`  ✓ draft ditulis ke "${draftsPath}"\n`);
      tally.draft++;
    } catch (err) {
      // One bad email must not end the run — the next one may be the prospect.
      console.error(`  ✗ gagal memproses: ${err.message}\n`);
      tally.gagal++;
    }
  }
} finally {
  await client.logout().catch(() => {});
}

console.log(
  `\nRingkasan: ${tally.dilihat} diproses — ${tally.draft} draft, ${tally.ditahan} ditahan linter, ` +
  `${tally.manusia} perlu dijawab sendiri, ${tally.aturan + tally.abaikan} dilewati, ${tally.gagal} gagal.`,
);
if (!TRIAGE_ONLY && !DRY_RUN && tally.draft > 0) {
  console.log(`Buka folder Drafts di webmail, baca, lalu kirim sendiri. Tidak ada yang terkirim otomatis.`);
}
process.exit(tally.gagal > 0 ? 1 : 0);
