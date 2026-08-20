// Smoke test for the connection, before any model or mailbox write is involved.
//
// Exists because the two things most likely to be wrong on a first run are also
// the two things the rest of the pipeline can only discover the hard way: the
// IMAP host/credentials, and what this provider actually calls its Drafts
// folder. Finding that out by running the full pipeline means paying for model
// calls to learn that the mailbox was never reachable.
//
// Reads nothing but folder names and a message count. Writes nothing anywhere.
//
//   npm run inbox:check

import { connect, findDraftsMailbox, inboxAddress } from "./imap.mjs";
import { readEnv } from "./env.mjs";

const days = Number(readEnv("INBOX_CHECK_DAYS") ?? 3);

console.log(`Alamat pengirim : ${inboxAddress()}`);
console.log(`Host IMAP       : ${readEnv("INBOX_IMAP_HOST")}:${readEnv("INBOX_IMAP_PORT") ?? 993}`);
console.log("");

// A failure here already exits with an actionable message — see connect().
const client = await connect();
console.log("✓ Koneksi & login IMAP berhasil.\n");

try {
  const boxes = await client.list();
  console.log(`Folder di mailbox ini (${boxes.length}):`);
  for (const box of boxes) {
    console.log(`  ${box.path}${box.specialUse ? `   [${box.specialUse}]` : ""}`);
  }

  console.log("");
  try {
    const drafts = await findDraftsMailbox(client);
    console.log(`✓ Folder Drafts terdeteksi: "${drafts}"`);
    console.log(`  Ke sinilah draft akan ditulis.`);
  } catch (err) {
    // Not fatal for a check run: knowing the folder is missing IS the result.
    console.log(`✗ ${err.message}`);
    console.log(`  npm run inbox:draft akan berhenti dengan pesan ini sebelum memproses apa pun.`);
  }

  console.log("");
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const uids = await client.search({ since }, { uid: true });
    console.log(`✓ INBOX terbaca: ${uids.length} email dalam ${days} hari terakhir.`);
    if (uids.length === 0) {
      console.log(`  Kirim satu email uji dari alamat NON-@intellibaseai.com, lalu ulangi.`);
    }
  } finally {
    lock.release();
  }
} finally {
  await client.logout().catch(() => {});
}

console.log(`\nTidak ada yang diubah: tidak ada email ditandai dibaca, tidak ada draft dibuat.`);
