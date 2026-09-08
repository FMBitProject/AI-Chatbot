// Regression test untuk enkripsi kunci BYOK (src/lib/secret-box.ts).
//
// File terpisah dari security.test.mts karena harus mengutak-atik
// process.env.BYOK_SECRET_KEY — termasuk menghapusnya — dan itu tidak boleh
// bocor ke test lain.
//
// Jalankan: npm run test:secret-box

import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret, isEncrypted } from "../src/lib/secret-box.ts";

let gagal = 0;
const laporkan = (ok: boolean, nama: string, catatan = "") => {
  if (!ok) gagal++;
  console.log(`  ${ok ? "PASS" : "GAGAL"}  ${nama}${catatan}`);
};
const sama = (aktual: unknown, harusnya: unknown, nama: string) =>
  laporkan(
    Object.is(aktual, harusnya),
    nama,
    Object.is(aktual, harusnya) ? "" : ` — dapat ${JSON.stringify(aktual)}, harusnya ${JSON.stringify(harusnya)}`,
  );
const melempar = (fn: () => unknown, nama: string) => {
  try {
    fn();
    laporkan(false, nama, " — TIDAK melempar apa-apa");
  } catch {
    laporkan(true, nama);
  }
};

const KUNCI_A = randomBytes(32).toString("base64");
const KUNCI_B = randomBytes(32).toString("base64");
process.env.BYOK_SECRET_KEY = KUNCI_A;

const KONTEKS = "company-123:groqApiKey";
const RAHASIA = "gsk_kunci_groq_pelanggan_yang_asli";

console.log("\nBOLAK-BALIK — secret-box");
const tersimpan = encryptSecret(RAHASIA, KONTEKS);
sama(decryptSecret(tersimpan, KONTEKS), RAHASIA, "terenkripsi lalu didekripsi = string semula");
sama(tersimpan.includes(RAHASIA), false, "plaintext tidak muncul di nilai tersimpan");
sama(tersimpan.startsWith("v1:"), true, "diberi label skema v1 supaya rotasi kunci nanti bisa bertahap");
sama(tersimpan.split(":").length, 4, "format: skema:iv:tag:ciphertext");
sama(isEncrypted(tersimpan), true, "isEncrypted mengenali tulisan sendiri");

sama(decryptSecret(encryptSecret("", KONTEKS), KONTEKS), "", "string kosong ikut bolak-balik utuh");
const panjang = "x".repeat(400);
sama(decryptSecret(encryptSecret(panjang, KONTEKS), KONTEKS), panjang, "kunci sepanjang batas LIMITS.apiKey utuh");
const unicode = "kunci-Ω-日本語-🔑";
sama(decryptSecret(encryptSecret(unicode, KONTEKS), KONTEKS), unicode, "UTF-8 multibyte utuh (bukan latin1)");

console.log("\nIV ACAK — secret-box");
const a = encryptSecret(RAHASIA, KONTEKS);
const b = encryptSecret(RAHASIA, KONTEKS);
sama(a === b, false, "plaintext sama → ciphertext BEDA (IV acak tiap panggilan)");
const ivSet = new Set(Array.from({ length: 200 }, () => encryptSecret("x", KONTEKS).split(":")[1]));
sama(ivSet.size, 200, "200 enkripsi → 200 IV unik; IV berulang di GCM membocorkan kunci autentikasi");

console.log("\nAUTENTIKASI — secret-box");
melempar(
  () => decryptSecret(tersimpan, "company-999:groqApiKey"),
  "konteks perusahaan lain DITOLAK — baris tak bisa dipindah antar tenant",
);
melempar(
  () => decryptSecret(tersimpan, "company-123:geminiApiKey"),
  "konteks kolom lain DITOLAK — kunci Groq tak bisa dipindah ke kolom Gemini",
);

const [skema, iv, tag, ct] = tersimpan.split(":");
const rusakkan = (b64: string) => {
  const buf = Buffer.from(b64, "base64");
  buf[0] ^= 0xff;
  return buf.toString("base64");
};
melempar(() => decryptSecret([skema, iv, tag, rusakkan(ct)].join(":"), KONTEKS), "ciphertext diutak-atik → melempar, bukan mengembalikan sampah");
melempar(() => decryptSecret([skema, rusakkan(iv), tag, ct].join(":"), KONTEKS), "IV diutak-atik → melempar");
melempar(() => decryptSecret([skema, iv, rusakkan(tag), ct].join(":"), KONTEKS), "tag diutak-atik → melempar");
melempar(
  () => decryptSecret([skema, Buffer.alloc(8).toString("base64"), tag, ct].join(":"), KONTEKS),
  "IV kependekan ditolak dengan pesan sendiri, bukan dekripsi diam-diam jadi sampah",
);
melempar(
  () => decryptSecret([skema, iv, Buffer.alloc(4).toString("base64"), ct].join(":"), KONTEKS),
  "tag kependekan ditolak dengan pesan sendiri",
);

process.env.BYOK_SECRET_KEY = KUNCI_B;
melempar(() => decryptSecret(tersimpan, KONTEKS), "kunci master salah → melempar (inti pertahanan saat DB bocor)");
process.env.BYOK_SECRET_KEY = KUNCI_A;
sama(decryptSecret(tersimpan, KONTEKS), RAHASIA, "kunci master benar dipasang lagi → terbaca lagi");

console.log("\nKOMPATIBILITAS LAMA — secret-box");
sama(decryptSecret("gsk_plaintext_lama", KONTEKS), "gsk_plaintext_lama", "baris plaintext pra-migrasi diteruskan apa adanya");
sama(isEncrypted("gsk_plaintext_lama"), false, "plaintext bukan format kita");
sama(isEncrypted("v2:a:b:c"), false, "skema lain belum dikenali");
sama(isEncrypted("v1:a:b"), false, "kurang satu bagian bukan format kita");
sama(isEncrypted("v1:a:b:c:d"), false, "kelebihan bagian bukan format kita");
sama(isEncrypted(""), false, "string kosong bukan format kita");
// Jebakan yang layak dicatat: kunci Groq asli tidak mengandung ':', tapi kalau
// suatu hari ada, plaintext berbentuk "v1:a:b:c" akan disangka ciphertext.
sama(isEncrypted("v1:bukan:base64:beneran"), true, "CATATAN: plaintext berbentuk v1:a:b:c akan disangka ciphertext");

console.log("\nKONFIGURASI — secret-box");
delete process.env.BYOK_SECRET_KEY;
melempar(() => encryptSecret("x", KONTEKS), "BYOK_SECRET_KEY tidak ada → melempar saat dipakai");
process.env.BYOK_SECRET_KEY = Buffer.alloc(16).toString("base64");
melempar(() => encryptSecret("x", KONTEKS), "kunci 16 byte ditolak — bukan 32");
process.env.BYOK_SECRET_KEY = KUNCI_A.slice(0, 20);
melempar(() => encryptSecret("x", KONTEKS), "kunci base64 terpotong ditolak (kasus token Search Console terulang)");
process.env.BYOK_SECRET_KEY = KUNCI_A;

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
