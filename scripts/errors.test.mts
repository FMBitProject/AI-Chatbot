// Regression test untuk lapisan galat, rantai model, terjemahan, dan daftar
// industri.
//
// Keempat modul ini menulis `from "@/lib/..."`, jadi sampai sekarang tidak bisa
// diuji sama sekali — bukan karena butuh database, tapi karena resolver Node
// tidak mengenal alias `@/`. scripts/ts-resolve-hook.mjs menutup jarak itu.
//
// Jalankan: npm run test:errors

import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PayloadTooLargeError,
  getUserMessage,
  readApiError,
} from "../src/lib/errors.ts";
import { INTERACTIVE_CHAIN, BATCH_CHAIN, usableChain, isRateLimitFailure, describeAiFailure } from "../src/lib/models.ts";
import { t, admin, pricing } from "../src/lib/i18n.ts";
import { INDUSTRIES, FEATURED_INDUSTRY, OTHER_INDUSTRIES } from "../src/lib/industries.ts";

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

console.log("\nKODE STATUS — errors");
for (const [Kelas, status, nama] of [
  [ValidationError, 400, "ValidationError"],
  [UnauthorizedError, 401, "UnauthorizedError"],
  [ForbiddenError, 403, "ForbiddenError"],
  [NotFoundError, 404, "NotFoundError"],
  [ConflictError, 409, "ConflictError"],
  [PayloadTooLargeError, 413, "PayloadTooLargeError"],
] as const) {
  const e = new (Kelas as new (m: string) => AppError)("pesan developer");
  sama(e.statusCode, status, `${nama} → HTTP ${status}`);
  sama(e instanceof AppError, true, `${nama} instanceof AppError (percabangan catch bergantung padanya)`);
  sama(e instanceof Error, true, `${nama} tetap Error biasa`);
}

console.log("\nAMPLOP JAWABAN — errors");
const v = new ValidationError("question must be a string");
sama(v.envelope().error.code, "VALIDATION_ERROR", "kode mesin ikut terkirim");
sama(
  v.envelope().error.message === "question must be a string",
  false,
  "pesan developer TIDAK bocor ke pengguna — itu untuk log",
);
sama(v.envelope("id").error.message, getUserMessage("VALIDATION_ERROR", "id"), "pengguna membaca pesan dari katalog");
sama(v.envelope("en").error.message !== v.envelope("id").error.message, true, "bahasa berbeda → kalimat berbeda");
sama("details" in v.envelope().error, false, "details dihilangkan kalau tidak ada, bukan dikirim undefined");
sama(
  new ValidationError("x", { details: { field: "email" } }).envelope().error.details !== undefined,
  true,
  "details ikut kalau klien bisa berbuat sesuatu dengannya",
);
sama(
  new ValidationError("x", { userMessage: "Email sudah dipakai." }).envelope().error.message,
  "Email sudah dipakai.",
  "userMessage khusus menang atas kalimat generik",
);

// Kasus yang pernah salah: /api/v1/query minta bahasa Inggris di body, tapi
// lapisan respons sudah tak tahu itu saat mengubah throw jadi response.
const inggris = new AppError("boom", "INTERNAL_ERROR", 500, { lang: "en" });
sama(
  inggris.envelope("id").error.message,
  getUserMessage("INTERNAL_ERROR", "en"),
  "lang di error MENANG atas tebakan responder — integrasi Inggris tak dijawab bahasa Indonesia",
);

console.log("\nKATALOG PESAN — errors");
const KODE = [
  "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT",
  "PAYLOAD_TOO_LARGE", "RATE_LIMITED", "UPSTREAM_ERROR", "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR", "QUOTA_EXCEEDED", "SEAT_FROZEN", "AI_REQUIRES_PAID_PLAN",
  "BYOK_KEY_UNREADABLE", "AI_RATE_LIMIT", "AI_ERROR", "QUESTION_TOO_LONG",
  "QUERY_TOO_LONG", "INVALID_FOLDER",
] as const;
let kosong = 0, samaDenganInternal = 0;
for (const kode of KODE) {
  for (const lang of ["id", "en"] as const) {
    if (!getUserMessage(kode, lang)?.trim()) kosong++;
  }
  // Kode yang jatuh ke INTERNAL_ERROR berarti belum punya entri sendiri — itu
  // persis bug yang pernah terjadi: pertanyaan kepanjangan dilaporkan sebagai
  // "ada yang salah di pihak kami".
  if (kode !== "INTERNAL_ERROR" && getUserMessage(kode, "id") === getUserMessage("INTERNAL_ERROR", "id")) {
    samaDenganInternal++;
    console.log(`        ↳ ${kode} tidak punya pesan sendiri`);
  }
}
sama(kosong, 0, `${KODE.length} kode × 2 bahasa: tidak ada pesan kosong`);
sama(samaDenganInternal, 0, "tidak ada kode yang diam-diam jatuh ke INTERNAL_ERROR");
sama(
  getUserMessage("KODE_YANG_TIDAK_ADA", "id"),
  getUserMessage("INTERNAL_ERROR", "id"),
  "kode asing → pesan INTERNAL_ERROR, bukan undefined di toast",
);
sama(getUserMessage("QUOTA_EXCEEDED"), getUserMessage("QUOTA_EXCEEDED", "id"), "bahasa default Indonesia");

console.log("\nMEMBACA GALAT DI KLIEN — readApiError");
const jawab = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

sama(
  (await readApiError(jawab(400, { error: { code: "QUOTA_EXCEEDED", message: "Kuota habis." } }))).message,
  "Kuota habis.",
  "amplop baru dibaca apa adanya",
);
sama(
  (await readApiError(jawab(400, { error: { code: "QUOTA_EXCEEDED", message: "Kuota habis." } }))).code,
  "QUOTA_EXCEEDED",
  "kode dari amplop baru",
);
// Bentuk lama /api/payment/create: kode huruf kecil DI SAMPING kalimat asli.
sama(
  (await readApiError(jawab(409, { error: "already_paid", message: "Pesanan ini sudah dibayar." }))).message,
  "Pesanan ini sudah dibayar.",
  "message di sebelahnya menang atas kode huruf kecil (bug lama: 'already_paid' ditampilkan ke pelanggan)",
);
sama(
  (await readApiError(jawab(500, "bukan json sama sekali"))).message?.length > 0,
  true,
  "body bukan JSON → tetap ada kalimat, bukan undefined",
);
sama((await readApiError(jawab(404, {}))).status, 404, "status HTTP selalu diteruskan");
sama(
  (await readApiError(jawab(429, {}))).message,
  getUserMessage("RATE_LIMITED", "id"),
  "body kosong → pesan diturunkan dari status HTTP",
);

console.log("\nRANTAI MODEL — models");
sama(INTERACTIVE_CHAIN.length >= 2, true, "rantai interaktif punya cadangan, bukan satu model");
sama(
  new Set(INTERACTIVE_CHAIN.map((l) => l.provider)).size >= 2,
  true,
  "lebih dari satu penyedia — 429 di Groq tidak mematikan semua kanal",
);
sama(INTERACTIVE_CHAIN[0].provider, "groq", "rung pertama Groq (terkuat & tercepat lebih dulu)");
sama(new Set(INTERACTIVE_CHAIN.map((l) => l.id)).size, INTERACTIVE_CHAIN.length, "tidak ada model kembar di rantai");
sama(
  BATCH_CHAIN.every((l) => l.provider === "groq"),
  true,
  "rantai batch Groq-saja — indexer tidak boleh menguras jatah Gemini harian",
);
sama(BATCH_CHAIN.length < INTERACTIVE_CHAIN.length, true, "batch memang lebih pendek dari interaktif");
sama(
  BATCH_CHAIN.every((l) => INTERACTIVE_CHAIN.some((i) => i.id === l.id)),
  true,
  "batch subset dari interaktif — tak ada model yang cuma dipakai indexer",
);

console.log("\nKUNCI TERSEDIA — models.usableChain");
const semua = { groq: "gsk_x", gemini: "AIza_x" };
sama(usableChain(INTERACTIVE_CHAIN, semua).length, INTERACTIVE_CHAIN.length, "dua kunci ada → seluruh rantai dipakai");
sama(
  usableChain(INTERACTIVE_CHAIN, { groq: "gsk_x", gemini: null }).every((l) => l.provider === "groq"),
  true,
  "tanpa kunci Gemini, rung Gemini dibuang lebih dulu — bukan gagal di tengah lalu menutupi galat asli",
);
sama(
  usableChain(INTERACTIVE_CHAIN, { groq: null, gemini: null }).length,
  0,
  "tanpa kunci sama sekali → rantai kosong (pemanggil melaporkan masalah kredensial)",
);

console.log("\nKENALI 429 — models.isRateLimitFailure");
sama(
  isRateLimitFailure(new Error("Request too large for model llama-3.3-70b ... tokens per minute (TPM): Limit 12000, Requested 12232")),
  true,
  "penolakan TPM Groq dikenali — datang sebagai 413 dan tanpa kata 'rate limit'",
);
sama(isRateLimitFailure(new Error("TOKENS PER MINUTE exceeded")), true, "pencocokan tidak peka huruf besar-kecil");
sama(isRateLimitFailure(new Error("Request Too Large")), true, "varian kapitalisasi lain juga kena");
sama(
  isRateLimitFailure(new Error("Invalid API key provided")),
  false,
  "kunci salah BUKAN alasan turun rantai — gagal sama di semua model",
);
sama(isRateLimitFailure(new Error("boom")), false, "galat acak bukan rate limit");
sama(isRateLimitFailure(null), false, "null tidak bikin crash");
sama(isRateLimitFailure(undefined), false, "undefined tidak bikin crash");
sama(isRateLimitFailure("tokens per minute"), true, "string mentah pun dibaca");

sama(
  describeAiFailure(new Error("tokens per minute"), "groq").error,
  "AI_RATE_LIMIT",
  "TPM → AI_RATE_LIMIT (pembaca disuruh menunggu sebentar — itu benar & bisa ditindak)",
);
sama(describeAiFailure(new Error("boom"), "google").error, "AI_ERROR", "galat lain → AI_ERROR");
sama(
  describeAiFailure(new Error("boom"), "google").provider,
  "google",
  "penyedia dilaporkan dari rung yang benar-benar gagal, bukan diasumsikan Groq",
);
sama(describeAiFailure(new Error("boom")).provider, "groq", "default groq kalau tak disebut");

console.log("\nTERJEMAHAN LENGKAP — i18n");
const bandingKunci = (obj: Record<string, unknown>, nama: string) => {
  const id = Object.keys((obj.id ?? {}) as object).sort();
  const en = Object.keys((obj.en ?? {}) as object).sort();
  const hilangEn = id.filter((k) => !en.includes(k));
  const hilangId = en.filter((k) => !id.includes(k));
  sama(hilangEn.length, 0, `${nama}: tidak ada kunci yang cuma ada di id${hilangEn.length ? ` (${hilangEn.join(", ")})` : ""}`);
  sama(hilangId.length, 0, `${nama}: tidak ada kunci yang cuma ada di en${hilangId.length ? ` (${hilangId.join(", ")})` : ""}`);
  sama(id.length > 0, true, `${nama}: ada isinya`);
};
bandingKunci(t as Record<string, unknown>, "t");
bandingKunci(admin as Record<string, unknown>, "admin");
bandingKunci(pricing as Record<string, unknown>, "pricing");

console.log("\nDAFTAR INDUSTRI — industries");
sama(INDUSTRIES.length > 1, true, "lebih dari satu industri — produknya bukan khusus rumah sakit");
sama(new Set(INDUSTRIES.map((i) => i.key)).size, INDUSTRIES.length, "key industri unik");
sama(INDUSTRIES.every((i) => i.name.id && i.name.en), true, "setiap industri punya nama dua bahasa");
sama(INDUSTRIES.every((i) => i.docs.id && i.docs.en), true, "setiap industri punya contoh dokumen dua bahasa");
sama(FEATURED_INDUSTRY !== null, true, "ada satu industri yang diangkat jadi band");
sama(!!FEATURED_INDUSTRY?.href, true, "industri unggulan punya href — CTA-nya harus menuju suatu tempat");
sama(
  OTHER_INDUSTRIES.some((i) => i.key === FEATURED_INDUSTRY?.key),
  false,
  "industri unggulan TIDAK muncul lagi di baris bawah (duplikat = bug bagi pembaca, duplicate content bagi crawler)",
);
sama(OTHER_INDUSTRIES.length, INDUSTRIES.length - 1, "unggulan + sisanya = seluruh daftar, tak ada yang hilang");
sama(
  FEATURED_INDUSTRY?.featured?.points.id.length === FEATURED_INDUSTRY?.featured?.points.en.length,
  true,
  "poin band unggulan sama banyak di dua bahasa",
);

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
