// Regression test for the rule layer — the half that decides what never reaches
// a model and never gets a reply.
//
// Driven from raw MIME on purpose. The first version of this file built the
// `headers` object by hand and fed it straight to ruleSkip, which tested the
// rules and skipped the mapping that produces their input. That mapping was
// broken: mailparser folds every `List-*` header into one structured `list`
// entry, so `headers.get("list-unsubscribe")` was undefined on a message that
// plainly carried the header, and the newsletter guard never fired once while
// every test passed. Real emails go in now, so a header the parser renames again
// breaks the test instead of silently disabling a rule.
//
// Run: npm run inbox:test

import { simpleParser } from "mailparser";
import { toMessage, senderName, bareSubject, isReplySubject } from "./imap.mjs";
import { ruleSkip } from "./triage.mjs";

const CONFIG = { ownDomain: "intellibaseai.com", skipDomains: ["contoh-spam.id"] };

/** Assembles a real RFC822 message and runs it through the same path as fetchRecent. */
async function message({ headers = [], body = "Halo, berapa biayanya untuk 40 karyawan?" } = {}) {
  const base = new Map([
    ["From", "Budi <budi@rumahsakitsehat.co.id>"],
    ["To", "hello@intellibaseai.com"],
    ["Subject", "Tanya harga untuk 40 karyawan"],
    ["Message-ID", "<asli-123@rumahsakitsehat.co.id>"],
    ["Date", "Wed, 19 Aug 2026 09:00:00 +0700"],
  ]);
  // A header given as "Key:" with no value removes it; anything else overrides.
  for (const line of headers) {
    const key = line.slice(0, line.indexOf(":"));
    const value = line.slice(line.indexOf(":") + 1).trim();
    if (value) base.set(key, value);
    else base.delete(key);
  }
  const raw = [...base].map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n" + body;
  return toMessage(await simpleParser(raw), 1);
}

const HARUS_DILEWATI = [
  ["email dari domain sendiri (loop guard)", { headers: ["From: IntelliBase <hello@intellibaseai.com>"] }],
  ["balasan kita sendiri lewat noreply", { headers: ["From: noreply@intellibaseai.com"] }],
  ["alamat no-reply pihak lain", { headers: ["From: Vercel <no-reply@vercel.com>"] }],
  ["mailer-daemon", { headers: ["From: MAILER-DAEMON@hostinger.com"] }],
  ["Auto-Submitted: auto-replied", { headers: ["Auto-Submitted: auto-replied"] }],
  ["Precedence: bulk", { headers: ["Precedence: bulk"] }],
  // The two cases the old test could not see.
  ["punya List-Unsubscribe (newsletter)", { headers: ["List-Unsubscribe: <https://x.test/u>"] }],
  ["punya List-Id (milis)", { headers: ["List-Id: <news.x.test>"] }],
  ["header X-Autoreply", { headers: ["X-Autoreply: yes"] }],
  ["subjek out of office", { headers: ["Subject: Out of Office: Re: Tanya harga"] }],
  ["subjek balasan otomatis", { headers: ["Subject: Balasan Otomatis: sedang cuti"] }],
  ["subjek bounce", { headers: ["Subject: Undeliverable: Tanya harga"] }],
  ["badan email kosong", { body: "   \n  " }],
  ["badan hanya kutipan thread lama", { body: "> Halo, ini pesan lama\n> baris kedua" }],
  ["domain di INBOX_SKIP_DOMAINS", { headers: ["From: promo@contoh-spam.id"] }],
  ["pengirim tanpa alamat", { headers: ["From:"] }],
];

const HARUS_LOLOS = [
  ["prospek biasa", {}],
  ["Auto-Submitted: no (mail manusia yang eksplisit)", { headers: ["Auto-Submitted: no"] }],
  // The no-reply pattern is anchored at the start of the address for this
  // reason: "notifications" inside someone's real address is not a robot.
  ["alamat manusia yang memuat kata notifications", { headers: ["From: Budi <budi.notifications@gmail.com>"] }],
  ["subjek menyebut 'automatic' tapi bukan autoreply", { headers: ["Subject: Automatic backup kami gagal, bisa bantu?"] }],
  ["subjek Re: biasa", { headers: ["Subject: Re: Tanya harga untuk 40 karyawan"] }],
  ["domain mirip domain sendiri tapi bukan", { headers: ["From: sales@intellibaseai.com.co"] }],
  ["balasan manusia dengan kutipan di bawahnya", { body: "Baik, saya tertarik.\n\nPada 19 Agu 2026 pukul 09.00 menulis:\n> penawaran lama" }],
];

let gagal = 0;
const laporkan = (ok, nama, catatan = "") => {
  if (!ok) gagal++;
  console.log(`  ${ok ? "PASS" : "GAGAL"}  ${nama}${catatan}`);
};

console.log("HARUS DILEWATI:");
for (const [nama, spec] of HARUS_DILEWATI) {
  const reason = ruleSkip(await message(spec), CONFIG);
  laporkan(Boolean(reason), nama, reason ? ` — ${reason}` : "");
}

console.log("\nHARUS LOLOS (email manusia, harus sampai ke triase):");
for (const [nama, spec] of HARUS_LOLOS) {
  const reason = ruleSkip(await message(spec), CONFIG);
  laporkan(!reason, nama, reason ? ` — terlanjur dilewati: ${reason}` : "");
}

// The dedupe key is what stops a second run writing a second draft, so it gets
// checked directly: an email without a Message-ID used to produce no key at all,
// which meant it was never recorded as handled and got a fresh draft every run.
console.log("\nKUNCI DEDUPLIKASI:");
{
  const asli = await message();
  laporkan(asli.key === "<asli-123@rumahsakitsehat.co.id>", "pakai Message-ID kalau ada", ` — ${asli.key}`);

  const tanpaId = await message({ headers: ["Message-ID:"] });
  const tanpaIdLagi = await message({ headers: ["Message-ID:"] });
  laporkan(tanpaId.messageId === undefined || tanpaId.messageId === null, "tanpa Message-ID: messageId memang kosong");
  laporkan(Boolean(tanpaId.key), "tanpa Message-ID: tetap punya kunci", ` — ${tanpaId.key}`);
  laporkan(tanpaId.key === tanpaIdLagi.key, "kunci turunan stabil antar-run");

  const lain = await message({ headers: ["Message-ID:", "Subject: Pertanyaan lain"] });
  laporkan(tanpaId.key !== lain.key, "email berbeda dapat kunci berbeda");
}

// How the draft opens. "Halo," costs nothing; "Halo renfael6," tells the one
// prospect who wrote in that a bot answered them.
console.log("\nNAMA SAPAAN:");
{
  const kasus = [
    // [nama tampilan, alamat, harapan]
    ["Budi Santoso", "budi@rs.co.id", "Budi"],
    ["budi", "budi@rs.co.id", "Budi"],
    ["Suparman", "suparman@rs.co.id", "Suparman"],
    ["Dr. Sari", "sari@rs.co.id", "Sari"],   // gelar dilewati, bukan dijadikan sapaan
    // handle: huruf kapital di tengah
    ["SuperCreede", "renfael6@gmail.com", null],
    // handle: ada angka
    ["budi123", "renfael6@gmail.com", null],
    // organisasi, bukan orang
    ["PT Sehat Sentosa", "kontak@sehat.co.id", null],
    ["IntelliBase Support", "x@y.co.id", null],
    // tanpa nama tampilan → jatuh ke bagian sebelum @
    ["", "budi.santoso@rs.co.id", "Budi"],
    ["", "renfael6@gmail.com", null],
    ["", "info@rs.co.id", null],
    ["", "hr@rs.co.id", null],
  ];
  for (const [display, address, harapan] of kasus) {
    const hasil = senderName({ name: display, address });
    laporkan(hasil === harapan, `"${display}" <${address}>`, ` → ${JSON.stringify(hasil)}`);
  }
}

// The fallback dedupe key. It is built only from messages that are themselves
// replies, and that condition is the entire safeguard: built from every sent
// message instead, outbound cold outreach produced exactly the key the
// prospect's reply would later look up, and their reply was skipped as already
// answered — silently, for the most valuable email there is.
console.log("\nKUNCI BALASAN (regresi outreach):");
{
  const kunci = (to, subject) => `${to.toLowerCase()}|${bareSubject(subject)}`;

  // Yang BOLEH menyumbang kunci: pesan yang memang balasan.
  for (const [nama, subjek] of [
    ["balasan kita sendiri", "Re: Tanya harga"],
    ["balasan versi Gmail Indonesia", "Bls: Tanya harga"],
    ["balasan bertumpuk", "Re: Re: Tanya harga"],
  ]) {
    laporkan(isReplySubject(subjek), nama + " dihitung sebagai balasan", ` — "${subjek}"`);
  }

  // Yang TIDAK boleh: pesan pembuka.
  for (const [nama, subjek] of [
    ["cold outreach", "Perkenalan IntelliBase"],
    ["forward ke kolega", "Fwd: Tanya harga"],
    ["subjek biasa", "Undangan demo"],
  ]) {
    laporkan(!isReplySubject(subjek), nama + " TIDAK dihitung sebagai balasan", ` — "${subjek}"`);
  }

  // Kasus persis yang dulu bocor: outreach terkirim vs balasan prospek.
  const outreach = kunci("budi@rs.co.id", "Perkenalan IntelliBase");
  const balasanProspek = kunci("budi@rs.co.id", "Re: Perkenalan IntelliBase");
  laporkan(
    outreach === balasanProspek && !isReplySubject("Perkenalan IntelliBase"),
    "outreach berkunci sama dengan balasan prospek, TAPI tidak menyumbang kunci",
    ` — ${JSON.stringify(outreach)}`,
  );
}

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus gagal`);
process.exit(gagal === 0 ? 0 : 1);
