// Regression test for the rule layer in triage.mjs — the half that decides what
// never reaches a model and never gets a reply.
//
// Worth a test even though the LLM half isn't, because this is where the
// expensive mistakes live: skipping a real prospect means a lost customer,
// and *not* skipping an autoresponder is how a mail loop starts. Both are
// pure functions of headers, so both can be checked offline in a second.
//
// Run: npm run inbox:test

import { ruleSkip } from "./triage.mjs";

const CONFIG = { ownDomain: "intellibaseai.com", skipDomains: ["contoh-spam.id"] };

/** A plausible human email; each case overrides only what it is testing. */
const email = (over = {}) => ({
  from: { address: "budi@rumahsakitsehat.co.id", name: "Budi" },
  subject: "Tanya harga untuk 40 karyawan",
  body: "Halo, saya tertarik. Berapa biayanya untuk 40 karyawan?",
  headers: { autoSubmitted: "", precedence: "", listId: "", listUnsubscribe: "", autoreply: "" },
  ...over,
});

const h = (over) => ({ headers: { autoSubmitted: "", precedence: "", listId: "", listUnsubscribe: "", autoreply: "", ...over } });

const HARUS_DILEWATI = [
  ["email dari domain sendiri (loop guard)", email({ from: { address: "hello@intellibaseai.com", name: "IntelliBase" } })],
  ["balasan kita sendiri lewat noreply", email({ from: { address: "noreply@intellibaseai.com", name: "" } })],
  ["alamat no-reply pihak lain", email({ from: { address: "no-reply@vercel.com", name: "Vercel" } })],
  ["mailer-daemon", email({ from: { address: "MAILER-DAEMON@hostinger.com", name: "" } })],
  ["Auto-Submitted: auto-replied", email(h({ autoSubmitted: "auto-replied" }))],
  ["Precedence: bulk", email(h({ precedence: "bulk" }))],
  ["punya List-Unsubscribe (newsletter)", email(h({ listUnsubscribe: "<https://x.test/u>" }))],
  ["punya List-Id (milis)", email(h({ listId: "<news.x.test>" }))],
  ["header X-Autoreply", email(h({ autoreply: "yes" }))],
  ["subjek out of office", email({ subject: "Out of Office: Re: Tanya harga" })],
  ["subjek balasan otomatis", email({ subject: "Balasan Otomatis: sedang cuti" })],
  ["subjek bounce", email({ subject: "Undeliverable: Tanya harga" })],
  ["badan email kosong", email({ body: "   \n  " })],
  ["domain di INBOX_SKIP_DOMAINS", email({ from: { address: "promo@contoh-spam.id", name: "" } })],
  ["pengirim tanpa alamat", email({ from: { address: "", name: "Anonim" } })],
];

const HARUS_LOLOS = [
  ["prospek biasa", email()],
  ["Auto-Submitted: no (mail manusia yang eksplisit)", email(h({ autoSubmitted: "no" }))],
  // The no-reply pattern is anchored at the start of the address for this
  // reason: "notifications" inside someone's real address is not a robot.
  ["alamat manusia yang memuat kata notifications", email({ from: { address: "budi.notifications@gmail.com", name: "Budi" } })],
  ["subjek menyebut 'automatic' tapi bukan autoreply", email({ subject: "Automatic backup kami gagal, bisa bantu?" })],
  ["subjek Re: biasa", email({ subject: "Re: Tanya harga untuk 40 karyawan" })],
  ["domain mirip domain sendiri tapi bukan", email({ from: { address: "sales@intellibaseai.com.co", name: "" } })],
];

let gagal = 0;

console.log("HARUS DILEWATI:");
for (const [nama, msg] of HARUS_DILEWATI) {
  const reason = ruleSkip(msg, CONFIG);
  if (!reason) gagal++;
  console.log(`  ${reason ? "PASS" : "GAGAL"}  ${nama}${reason ? ` — ${reason}` : ""}`);
}

console.log("\nHARUS LOLOS (email manusia, harus sampai ke triase):");
for (const [nama, msg] of HARUS_LOLOS) {
  const reason = ruleSkip(msg, CONFIG);
  if (reason) gagal++;
  console.log(`  ${reason ? "GAGAL" : "PASS"}  ${nama}${reason ? ` — terlanjur dilewati: ${reason}` : ""}`);
}

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus gagal`);
process.exit(gagal === 0 ? 0 : 1);
