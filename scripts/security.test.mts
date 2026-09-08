// Regression test untuk unit-unit yang menjaga uang dan kunci.
//
// Sama seperti scripts/pricing.test.mts: menjalankan modul ASLI di src/lib,
// bukan salinan. Semua modul di file ini hanya bergantung pada `crypto` bawaan
// Node atau tidak mengimpor apa pun, jadi tidak ada database, jaringan, atau
// kerangka test yang perlu disiapkan.
//
// Jalankan: npm run test:security

import {
  isValidNotificationSignature,
  isSettledStatus,
  amountMatches,
  closedTransactionStatus,
  isReversalStatus,
} from "../src/lib/midtrans.ts";
import { hashApiKey, generateApiKey } from "../src/lib/api-key.ts";
import { checkPassword, isPasswordValid } from "../src/lib/password.ts";
import { consumeRateLimit, isRateLimited, recordFailure, getClientIp } from "../src/lib/rate-limit.ts";
import { optionalString, optionalEmail, isOneOf, readJsonObject, LIMITS } from "../src/lib/validate.ts";
import { escapeHtml } from "../src/lib/email-template.ts";
import { createHash } from "crypto";

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

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTANDA TANGAN WEBHOOK — midtrans");

const KUNCI = "SB-Mid-server-CONTOH123";
const tandaTangan = (orderId: string, statusCode: string, gross: string, kunci = KUNCI) =>
  createHash("sha512").update(`${orderId}${statusCode}${gross}${kunci}`).digest("hex");

const notifSah = {
  order_id: "IB-1",
  status_code: "200",
  gross_amount: "199000.00",
  signature_key: tandaTangan("IB-1", "200", "199000.00"),
};

sama(isValidNotificationSignature(notifSah, KUNCI), true, "notifikasi asli diterima");
sama(
  isValidNotificationSignature({ ...notifSah, gross_amount: "1000.00" }, KUNCI),
  false,
  "nominal diubah → ditolak (ini yang mencegah paket dibeli seharga Rp1.000)",
);
sama(
  isValidNotificationSignature({ ...notifSah, order_id: "IB-2" }, KUNCI),
  false,
  "order id diubah → ditolak",
);
sama(
  isValidNotificationSignature(notifSah, "kunci-server-yang-salah"),
  false,
  "kunci server salah → ditolak",
);
sama(
  isValidNotificationSignature({ ...notifSah, signature_key: undefined }, KUNCI),
  false,
  "signature_key tidak ada → ditolak, bukan crash",
);
sama(
  isValidNotificationSignature({ ...notifSah, signature_key: 12345 }, KUNCI),
  false,
  "signature_key bukan string → ditolak (timingSafeEqual melempar kalau kebablasan)",
);
sama(
  isValidNotificationSignature({ ...notifSah, signature_key: "pendek" }, KUNCI),
  false,
  "signature_key beda panjang → ditolak, bukan melempar",
);
sama(
  isValidNotificationSignature({ ...notifSah, signature_key: notifSah.signature_key.toUpperCase() }, KUNCI),
  false,
  "hex huruf besar tidak diterima — perbandingan byte, bukan case-insensitive",
);

console.log("\nSTATUS TRANSAKSI — midtrans");
sama(isSettledStatus({ transaction_status: "settlement" }), true, "settlement = lunas");
sama(
  isSettledStatus({ transaction_status: "capture", fraud_status: "accept" }),
  true,
  "capture + fraud accept = lunas",
);
sama(
  isSettledStatus({ transaction_status: "capture", fraud_status: "challenge" }),
  false,
  "capture + fraud challenge BELUM lunas — uang masih bisa ditarik",
);
sama(isSettledStatus({ transaction_status: "capture" }), false, "capture tanpa fraud_status belum lunas");
sama(isSettledStatus({ transaction_status: "pending" }), false, "pending belum lunas");
sama(isSettledStatus({}), false, "payload kosong belum lunas");

sama(closedTransactionStatus("cancel"), "failed", "cancel → failed");
sama(closedTransactionStatus("deny"), "failed", "deny → failed");
sama(closedTransactionStatus("expire"), "expired", "expire → expired (dibedakan dari failed)");
sama(closedTransactionStatus("settlement"), null, "settlement bukan status tertutup");
sama(closedTransactionStatus("pending"), null, "pending masih terbuka");
sama(closedTransactionStatus(undefined), null, "undefined masih terbuka");

for (const s of ["refund", "partial_refund", "chargeback", "partial_chargeback"]) {
  sama(isReversalStatus(s), true, `${s} = uang balik ke pelanggan`);
}
sama(isReversalStatus("settlement"), false, "settlement bukan reversal");

console.log("\nCOCOK NOMINAL — midtrans");
sama(amountMatches("199000.00", "199000"), true, "format Midtrans '199000.00' == simpanan kita '199000'");
sama(amountMatches("199000", "199000"), true, "sama persis");
sama(amountMatches("1000.00", "199000"), false, "kurang bayar ditolak");
sama(amountMatches("abc", "199000"), false, "nominal tak terbaca ditolak");
sama(amountMatches(undefined, "199000"), false, "nominal hilang ditolak — bukan alasan memberi paket");
sama(amountMatches("199000.01", "199000"), false, "beda satu sen pun ditolak");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nKUNCI API — api-key");
sama(
  hashApiKey("ib_contoh"),
  createHash("sha256").update("ib_contoh").digest("hex"),
  "hash = SHA-256 hex dari kunci utuh",
);
sama(hashApiKey("ib_a") === hashApiKey("ib_a"), true, "hash deterministik — lookup harus bisa mencocokkan");
sama(hashApiKey("ib_a") === hashApiKey("ib_b"), false, "kunci beda → hash beda");

const k1 = generateApiKey();
const k2 = generateApiKey();
sama(k1.key.startsWith("ib_"), true, "kunci baru berawalan ib_");
sama(k1.key.length, 35, "ib_ + 32 hex = 35 karakter");
sama(/^ib_[0-9a-f]{32}$/.test(k1.key), true, "tanda hubung UUID dibuang");
sama(k1.hash, hashApiKey(k1.key), "hash tersimpan cocok dengan kunci yang diberikan sekali itu");
sama(k1.prefix, k1.key.slice(0, 12), "prefix = 12 karakter pertama");
sama(k1.key === k2.key, false, "dua kunci tidak pernah sama");
sama(k1.hash.length, 64, "SHA-256 hex = 64 karakter");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nATURAN SANDI — password");
sama(isPasswordValid("Rahasia1!"), true, "memenuhi keempat syarat");
sama(isPasswordValid("Rahasia1"), false, "tanpa karakter khusus ditolak");
sama(isPasswordValid("rahasia1!"), false, "tanpa huruf besar ditolak");
sama(isPasswordValid("Rahasia!"), false, "tanpa angka ditolak");
sama(isPasswordValid("Rhs1!"), false, "kurang dari 8 karakter ditolak");
sama(isPasswordValid("Rahasi1!"), true, "tepat 8 karakter diterima — batasnya >= bukan >");
sama(isPasswordValid(""), false, "sandi kosong ditolak");
sama(checkPassword("Rahasia1!").hasSpecial, true, "'!' dihitung karakter khusus");
sama(checkPassword("Rahasia1 ").hasSpecial, true, "spasi juga karakter khusus (bukan huruf/angka)");
sama(checkPassword("Ámbar1x").hasUppercase, false, "huruf beraksen TIDAK dihitung huruf besar — regex A-Z saja");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nIP KLIEN — rate-limit (perbaikan spoofing di branch ini)");
const req = (h: Record<string, string>) => new Request("https://x.test", { headers: h });

sama(
  getClientIp(req({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })),
  "9.9.9.9",
  "header platform menang atas x-forwarded-for yang bisa ditulis pemanggil",
);
sama(
  getClientIp(req({ "x-forwarded-for": "1.1.1.1, 8.8.8.8" })),
  "8.8.8.8",
  "hop TERAKHIR yang dipakai — hop pertama diketik penyerang",
);
sama(
  getClientIp(req({ "x-forwarded-for": "5.5.5.5" })),
  "5.5.5.5",
  "satu hop: pertama dan terakhir sama, jadi platform yang menimpa header tetap benar",
);
sama(
  getClientIp(req({ "x-forwarded-for": "1.1.1.1,   8.8.8.8   " })),
  "8.8.8.8",
  "spasi di sekitar hop dipangkas",
);
sama(getClientIp(req({ "x-real-ip": "7.7.7.7" })), "7.7.7.7", "jatuh ke x-real-ip");
sama(getClientIp(req({})), "unknown", "tanpa header apa pun → 'unknown', bukan undefined");

// Inti perbaikannya: penyerang tidak bisa memilih kuncinya sendiri.
const kunciPenyerang = new Set<string>();
for (let i = 0; i < 50; i++) {
  kunciPenyerang.add(getClientIp(req({ "x-forwarded-for": `10.0.0.${i}, 8.8.8.8` })));
}
sama(
  kunciPenyerang.size,
  1,
  "50 nilai x-forwarded-for palsu tetap menghasilkan SATU kunci — batas tak bisa di-reset",
);

console.log("\nHITUNG PERCOBAAN — rate-limit");
const ATURAN = { max: 3, windowMs: 60_000 };
const kunci = `uji-${Date.now()}`;
sama(consumeRateLimit(kunci, ATURAN).ok, true, "percobaan ke-1 lolos");
sama(consumeRateLimit(kunci, ATURAN).ok, true, "percobaan ke-2 lolos");
sama(consumeRateLimit(kunci, ATURAN).ok, true, "percobaan ke-3 lolos (tepat di batas)");
const ditolak = consumeRateLimit(kunci, ATURAN);
sama(ditolak.ok, false, "percobaan ke-4 ditolak — max=3 berarti 3, bukan 4");
sama(ditolak.retryAfter > 0 && ditolak.retryAfter <= 60, true, "retryAfter diisi detik yang masuk akal");
sama(consumeRateLimit(`lain-${Date.now()}`, ATURAN).ok, true, "kunci lain tidak ikut kena");

const kunciJendela = `jendela-${Date.now()}`;
const SEKEJAP = { max: 1, windowMs: 1 };
consumeRateLimit(kunciJendela, SEKEJAP);
await new Promise((r) => setTimeout(r, 5));
sama(consumeRateLimit(kunciJendela, SEKEJAP).ok, true, "jendela kedaluwarsa → hitungan mulai dari nol lagi");

const kunciGagal = `gagal-${Date.now()}`;
sama(isRateLimited(kunciGagal, ATURAN), false, "kunci yang belum pernah gagal tidak terblokir");
recordFailure(kunciGagal, ATURAN);
recordFailure(kunciGagal, ATURAN);
sama(isRateLimited(kunciGagal, ATURAN), false, "2 dari 3 kegagalan belum memblokir");
recordFailure(kunciGagal, ATURAN);
sama(isRateLimited(kunciGagal, ATURAN), true, "kegagalan ke-3 memblokir");
sama(isRateLimited(`belum-ada-${Date.now()}`, ATURAN), false, "isRateLimited tidak ikut menghitung");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nVALIDASI INPUT — validate");
sama(optionalString("  halo  ", 100), "halo", "dipangkas, dan nilai terpangkas itu yang dikembalikan");
sama(optionalString("   ", 100), null, "spasi doang = kosong");
sama(optionalString("", 100), null, "string kosong ditolak");
sama(optionalString(123, 100), null, "angka bukan string");
sama(optionalString(null, 100), null, "null ditolak");
sama(optionalString(undefined, 100), null, "undefined ditolak");
sama(optionalString({ toString: () => "halo" }, 100), null, "objek tidak dipaksa jadi string");
sama(optionalString("a".repeat(100), 100), "a".repeat(100), "tepat di batas diterima");
sama(optionalString("a".repeat(101), 100), null, "lewat satu karakter ditolak");
sama(optionalString(`  ${"a".repeat(100)}  `, 100), "a".repeat(100), "dipangkas DULU baru diukur");

sama(optionalEmail("budi@rs.co.id"), "budi@rs.co.id", "alamat wajar diterima");
sama(optionalEmail("  budi@rs.co.id  "), "budi@rs.co.id", "spasi tempelan dipangkas — ini yang bikin akun tak bisa login");
sama(optionalEmail("budi"), null, "tanpa @ ditolak");
sama(optionalEmail("budi@rs"), null, "tanpa titik ditolak");
sama(optionalEmail("budi@rs."), null, "titik di ujung ditolak");
sama(optionalEmail("budi @rs.co.id"), null, "ada spasi di dalam ditolak");
sama(optionalEmail("a@b.co"), "a@b.co", "alamat pendek sah");
sama(optionalEmail(`${"a".repeat(250)}@b.co`), null, `lebih dari ${LIMITS.email} karakter ditolak`);
sama(optionalEmail(42), null, "bukan string ditolak");

// ReDoS: pola ditulis agar tidak bisa backtracking. Kalau regex-nya diganti
// ceroboh, baris ini menggantung alih-alih gagal — itu justru sinyalnya.
const mulai = Date.now();
optionalEmail(`a@${"a.".repeat(120)}`);
sama(Date.now() - mulai < 1000, true, "input musuh sepanjang 254 karakter selesai seketika (bukan ReDoS)");

sama(isOneOf("admin", ["admin", "employee"] as const), true, "nilai yang diizinkan lolos");
sama(isOneOf("owner", ["admin", "employee"] as const), false, "nilai lain ditolak");
sama(isOneOf(null, ["admin"] as const), false, "null ditolak");

const samaJson = (aktual: unknown, harusnya: unknown, nama: string) =>
  laporkan(
    JSON.stringify(aktual) === JSON.stringify(harusnya),
    nama,
    JSON.stringify(aktual) === JSON.stringify(harusnya) ? "" : ` — dapat ${JSON.stringify(aktual)}`,
  );
const post = (body: string) => new Request("https://x.test", { method: "POST", body });

samaJson(await readJsonObject(post('{"a":1}')), { a: 1 }, "objek JSON wajar diteruskan");
sama(await readJsonObject(post("{rusak")), null, "JSON rusak → null, bukan 500");
sama(await readJsonObject(post("")), null, "body kosong → null");
sama(await readJsonObject(post("null")), null, "'null' itu JSON sah tapi bukan objek — didestrukturisasi = TypeError");
sama(await readJsonObject(post("4")), null, "angka telanjang ditolak");
sama(await readJsonObject(post('"x"')), null, "string telanjang ditolak");
sama(await readJsonObject(post("[1,2]")), null, "array ditolak — punya .length tapi bukan body kita");
samaJson(await readJsonObject(post("{}")), {}, "objek kosong itu sah, beda dari null");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nESCAPING HTML — email-template");
sama(
  escapeHtml('<script>alert(1)</script>'),
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "tag dilucuti — nama diketik sendiri saat daftar lalu masuk ke markup email",
);
sama(escapeHtml("PT. Maju & Sejahtera"), "PT. Maju &amp; Sejahtera", "ampersand wajar tetap tampil benar");
sama(escapeHtml('" onmouseover="x'), "&quot; onmouseover=&quot;x", "kutip ganda ditutup — lolos dari atribut");
sama(escapeHtml("O'Brien"), "O&#39;Brien", "kutip tunggal ditutup");
sama(
  escapeHtml("<&>"),
  "&lt;&amp;&gt;",
  "ampersand diproses PERTAMA — kalau tidak, &lt; jadi &amp;lt; dan entitasnya bocor",
);
sama(escapeHtml("Budi"), "Budi", "nama biasa tidak berubah");

// ─────────────────────────────────────────────────────────────────────────────
console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
