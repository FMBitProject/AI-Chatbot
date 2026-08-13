// Regression test untuk rule `plan-enumeration` (M1), dijalankan lewat lintText
// yang asli — bukan regex yang disalin ulang, supaya yang diuji benar-benar
// jalur kode yang dipakai generate.mjs.
import { lintText, splitProblems } from "./lint.mjs";

const HARUS_BLOKIR = [
  // Teks C1 PERSIS seperti yang sempat ditulis, termasuk "bukan biaya tambahan
  // terpisah" di ekor kalimat yang dulu menurunkannya jadi warning.
  ["C1 asli (Slack diklaim di Personal)",
   `Sekarang tutup celah itu dari sisi lain — hubungkan IntelliBase ke Slack tim Anda.

Ini fitur di paket berbayar (Personal, Professional, Enterprise), bukan biaya
tambahan terpisah.`],
  ["enumerasi dengan 'dan'", "Tersedia di paket Personal dan Professional."],
  ["urutan terbalik", "Paket Professional, Personal, dan Enterprise semuanya dapat fitur ini."],
  ["pakai garis miring", "Aktif di paket Personal/Professional."],
];

const HARUS_LOLOS = [
  ["split per audiens", "Individu pilih Personal, perusahaan pilih Professional atau Enterprise."],
  ["harga per audiens", "Personal Rp59.000/bulan untuk individu. Professional Rp200.000/bulan untuk tim."],
  ["disclaimer Slack", "Slack hanya untuk akun Perusahaan, bukan akun Individu."],
  ["post Individu murni", "Paket Personal-nya Rp59.000/bulan, cocok untuk dokumen pribadi."],
  ["tier perusahaan saja", "Paket Starter gratis, lalu Professional dan Enterprise untuk tim besar."],
];

let gagal = 0;
const punyaRule = (t) => lintText(t).some((v) => v.id === "plan-enumeration" && !v.negated);

console.log("HARUS BLOKIR:");
for (const [nama, teks] of HARUS_BLOKIR) {
  const ok = punyaRule(teks);
  if (!ok) gagal++;
  console.log(`  ${ok ? "PASS" : "GAGAL"}  ${nama}`);
}

console.log("\nHARUS LOLOS (tidak boleh kena plan-enumeration):");
for (const [nama, teks] of HARUS_LOLOS) {
  const ok = !punyaRule(teks);
  if (!ok) gagal++;
  console.log(`  ${ok ? "PASS" : "GAGAL"}  ${nama}`);
}

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus gagal`);
process.exit(gagal === 0 ? 0 : 1);
