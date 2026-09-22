// Regression test untuk unit yang membentuk jawaban RAG dan angka di halaman
// depan: chunker, rag-prompt, roi, upload-limits.
//
// Keempatnya nol-impor, jadi dijalankan langsung tanpa database atau jaringan.
//
// Jalankan: npm run test:rag

import { chunkText } from "../src/lib/chunker.ts";
import { ANSWER_STYLE, FOLLOW_UP_OFFER, GROUNDING_RULES, GROUNDING_REMINDER, RAG_TEMPERATURE } from "../src/lib/rag-prompt.ts";
import {
  calculateRoi,
  ROI_DEFAULTS,
  ANSWERABLE_SHARE,
  REALIZED_SHARE,
  MINUTES_WITH_AI,
  RECOVERED_SHARE_LABEL,
  ESTIMATE_NOTE,
} from "../src/lib/roi.ts";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "../src/lib/upload-limits.ts";
import { isFollowUpQuestion, retrievalQueryFor } from "../src/lib/follow-up.ts";

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

const CHUNK_SIZE = 1500; // konstanta privat di chunker.ts; disalin sebagai kontrak
const MIN_CHUNK = 50;

// Teks yang setiap kalimatnya unik, supaya penanda yang hilang benar-benar
// berarti hilang — bukan artefak indexOf menemukan salinan lain.
const kalimat = (i: number) => `Prosedur ${i} menjelaskan langkah unik ${i} yang harus diikuti petugas.`;
const teksUnik = (n: number, pemisah: string) =>
  Array.from({ length: n }, (_, i) => kalimat(i)).join(pemisah);

const penandaHilang = (teks: string, n: number) => {
  const chunks = chunkText(teks);
  let hilang = 0;
  for (let i = 0; i < n; i++) if (!chunks.some((c) => c.includes(`langkah unik ${i} `))) hilang++;
  return hilang;
};

console.log("\nTIDAK ADA ISI YANG HILANG — chunker");
// Kalau sebuah kalimat jatuh di antara dua chunk, kalimat itu tidak pernah
// bisa diambil retrieval — dokumennya "terindeks" tapi jawabannya hilang, dan
// tidak ada error di mana pun.
for (const [nama, pemisah] of [["spasi (satu paragraf panjang)", " "], ["paragraf \\n\\n", "\n\n"], ["baris \\n", "\n"]] as const) {
  sama(penandaHilang(teksUnik(100, pemisah), 100), 0, `100 kalimat dipisah ${nama}: tak satu pun hilang`);
}
sama(penandaHilang(teksUnik(100, "\r\n\r\n"), 100), 0, "CRLF (dokumen Windows) dinormalkan, tak ada yang hilang");
sama(penandaHilang(teksUnik(1000, " "), 1000), 0, "dokumen besar 1000 kalimat: tak satu pun hilang");

console.log("\nBATAS UKURAN — chunker");
const ukuranMaks = (teks: string) => Math.max(0, ...chunkText(teks).map((c) => c.length));
sama(ukuranMaks(teksUnik(500, " ")) <= CHUNK_SIZE, true, `prosa: tak ada chunk melebihi ${CHUNK_SIZE}`);
sama(ukuranMaks(teksUnik(500, "\n\n")) <= CHUNK_SIZE, true, "paragraf: tak ada chunk melebihi batas");
sama(
  ukuranMaks("x".repeat(5000)) <= CHUNK_SIZE,
  true,
  "5000 karakter tanpa satu pun punktuasi (mis. satu baris tabel) tetap dipotong keras",
);
sama(
  ukuranMaks("A".repeat(4000)) <= CHUNK_SIZE,
  true,
  "satu 'kata' 4000 karakter tidak meledakkan batas token embedding",
);
sama(chunkText("x".repeat(2000)).length, 2, "2000 karakter → 2 chunk");

console.log("\nTUMPANG TINDIH — chunker");
const c = chunkText(teksUnik(200, " "));
sama(c.length > 1, true, "dokumen panjang jadi banyak chunk");
let adaTumpang = 0;
for (let i = 1; i < c.length; i++) {
  const ekor = c[i - 1].slice(-100);
  if (c[i].includes(ekor.slice(0, 50))) adaTumpang++;
}
sama(
  adaTumpang >= c.length - 2,
  true,
  "chunk berurutan berbagi ekor — kalimat di sambungan tidak kehilangan konteks",
);

console.log("\nDOKUMEN PENDEK — chunker (kontrak, bukan bug)");
// chunkText membuang chunk <= 50 karakter, jadi dokumen sangat pendek
// menghasilkan NOL chunk. Itu disengaja dan ditangani di indexing.ts:306, yang
// melempar IndexError "Isi dokumen ini terlalu pendek untuk diindeks" sehingga
// admin melihat alasannya. Dipatok di sini supaya kalau MIN_CHUNK berubah,
// pesan di indexing.ts ikut ditinjau — bukan berubah diam-diam jadi dokumen
// yang tersimpan tanpa isi yang bisa dicari.
sama(chunkText("SOP cuci tangan: gosok 20 detik.").length, 0, `dokumen 32 karakter → 0 chunk (MIN_CHUNK=${MIN_CHUNK})`);
sama(chunkText("x".repeat(MIN_CHUNK)).length, 0, "tepat 50 karakter → 0 chunk (filter-nya > bukan >=)");
sama(chunkText("x".repeat(MIN_CHUNK + 1)).length, 1, "51 karakter → 1 chunk");
sama(chunkText("").length, 0, "teks kosong → 0 chunk, bukan ['']");
sama(chunkText("   \n\n   ").length, 0, "spasi dan baris kosong saja → 0 chunk");

console.log("\nATURAN GROUNDING — rag-prompt");
sama(RAG_TEMPERATURE, 0.2, "suhu rendah: tugasnya mengulang dokumen, bukan mengarang");
sama(RAG_TEMPERATURE > 0, true, "bukan nol — greedy decoding bikin model mengulang-ulang");
sama(/^1\./.test(GROUNDING_RULES.trim()), true, "mulai dari poin 1");
for (const n of ["1.", "2.", "3.", "4."]) {
  sama(GROUNDING_RULES.includes(`\n${n}`) || GROUNDING_RULES.startsWith(n), true, `poin ${n} ada`);
}
sama(
  GROUNDING_RULES.includes("5."),
  false,
  "berhenti di 4 — prompt chat menyambung di 5 dengan aturan formatnya sendiri",
);
sama(
  /NEVER state a number/.test(GROUNDING_RULES),
  true,
  "larangan menyebut angka di luar konteks tetap ada — ini aturan yang mencegah dosis obat dikarang",
);
sama(/STOP/.test(GROUNDING_RULES), true, "instruksi BERHENTI setelah 'tidak ditemukan' tetap ada");
sama(GROUNDING_REMINDER.length > 100, true, "pengingat akhir tidak terpangkas jadi satu kalimat");
sama(
  /reread/i.test(GROUNDING_REMINDER),
  true,
  "pengingat menyuruh membaca ULANG jawaban, bukan sekadar mengulang aturannya",
);

console.log("\nGAYA JAWABAN — rag-prompt");
sama(
  /^-/m.test(ANSWER_STYLE) && !/^[0-9]\./m.test(ANSWER_STYLE),
  true,
  "blok gaya tidak bernomor — supaya bisa ditempel di prompt chat (yang bernomor) maupun tiga kanal pendek",
);
sama(
  /not-found message is the exception/i.test(ANSWER_STYLE),
  true,
  "pesan tidak-ditemukan dikecualikan dari semua aturan gaya — kalimatnya harus berdiri sendiri, kalau tidak footer sumber Slack ikut terbawa",
);
sama(
  /never invent or guess a title/i.test(ANSWER_STYLE),
  true,
  "menyebut nama dokumen tidak boleh berubah jadi menebak nama dokumen",
);
sama(
  /never after a not-found message/i.test(FOLLOW_UP_OFFER),
  true,
  "tawaran lanjutan dilarang menempel pada jawaban tidak-ditemukan",
);
sama(
  /visibly hold more/i.test(FOLLOW_UP_OFFER),
  true,
  "tawaran lanjutan hanya boleh untuk hal yang memang ada di kutipan — kalau tidak, jawabannya nanti dikarang",
);
sama(RAG_TEMPERATURE, 0.2, "suhu TIDAK dinaikkan demi nada yang lebih hangat");

console.log("\nPERTANYAAN LANJUTAN — follow-up");
const sebelumnya = "gelang identitas berisi apa saja?";
sama(isFollowUpQuestion("kalau yang ungu?", sebelumnya), true, "pertanyaan 3 kata yang menggantung = lanjutan");
sama(isFollowUpQuestion("berapa lama?", sebelumnya), true, "pertanyaan super pendek = lanjutan");
sama(
  isFollowUpQuestion("bagaimana dengan pasien anak untuk prosedur tersebut?", sebelumnya),
  true,
  "kata rujukan ('tersebut') pada pertanyaan pendek-sedang = lanjutan",
);
sama(
  isFollowUpQuestion("Kalau karyawan mengundurkan diri, bagaimana prosedur offboarding dan berapa lama akses emailnya dicabut?", sebelumnya),
  false,
  "panjang dan berdiri sendiri, meski memuat 'kalau' — batas jumlah kata yang memisahkannya",
);
sama(
  isFollowUpQuestion("apa isi SOP identifikasi pasien?", sebelumnya),
  false,
  "menyebut topiknya sendiri = bukan lanjutan",
);
sama(isFollowUpQuestion("kalau yang ungu?", null), false, "tidak ada pertanyaan sebelumnya = tidak ada yang bisa disandari");
sama(isFollowUpQuestion("kalau yang ungu?", "   "), false, "pertanyaan sebelumnya kosong diperlakukan sama dengan tidak ada");
sama(
  retrievalQueryFor("kalau yang ungu?", sebelumnya),
  `${sebelumnya}\nkalau yang ungu?`,
  "yang dicari = pertanyaan sebelumnya + pertanyaan sekarang",
);
sama(
  retrievalQueryFor("apa isi SOP identifikasi pasien?", sebelumnya),
  "apa isi SOP identifikasi pasien?",
  "pertanyaan mandiri dicari apa adanya — persis seperti sebelum fitur ini ada",
);
sama(
  retrievalQueryFor("kalau yang ungu?", "x".repeat(400)).length <= 200 + "\nkalau yang ungu?".length,
  true,
  "pertanyaan sebelumnya dipotong 200 karakter supaya tidak menenggelamkan pertanyaan sekarang",
);
sama(
  isFollowUpQuestion("apakah institusi ini memakai formulir standar?", sebelumnya),
  false,
  "'itu' di dalam 'institusi' tidak ikut tertangkap — penanda dikunci sebagai kata utuh",
);

console.log("\nMODEL ROI — roi");
const r = calculateRoi(ROI_DEFAULTS);
sama(r.hoursPerMonth, (ROI_DEFAULTS.employees * ROI_DEFAULTS.questionsPerDay * ROI_DEFAULTS.workingDays * ROI_DEFAULTS.minutesPerSearch) / 60, "jam pencarian per bulan = orang × pertanyaan × hari × menit / 60");
sama(r.savingsWithAI < r.grossSaving, true, "penghematan bersih SELALU di bawah kotor — diskon 50% terlihat");
sama(r.savingsWithAI < r.costLost, true, "penghematan tak pernah melebihi biaya yang hilang");
sama(r.recoveredShare > 0 && r.recoveredShare < 1, true, "porsi terpulihkan di antara 0 dan 1");
sama(
  Math.round(r.recoveredShare * 100),
  28,
  "porsi terpulihkan ~28% — angka yang dikutip landing page; kalau berubah, salinan di halaman ikut berubah",
);
sama(RECOVERED_SHARE_LABEL, "~28%", "label diturunkan dari aritmetika, bukan diketik manual");
sama(
  r.savingsWithAI,
  r.grossSaving * REALIZED_SHARE,
  "savingsWithAI persis grossSaving × REALIZED_SHARE",
);

console.log("\nPENJAGA ROI — roi");
const nol = calculateRoi({ ...ROI_DEFAULTS, employees: 0 });
sama(nol.recoveredShare, 0, "0 karyawan → porsi 0, bukan NaN (pembagian nol dijaga)");
sama(nol.savingsWithAI, 0, "0 karyawan → hemat 0");
const cepat = calculateRoi({ ...ROI_DEFAULTS, minutesPerSearch: 1 });
sama(cepat.hoursSaved, 0, `pencarian 1 menit (< ${MINUTES_WITH_AI} menit pakai AI) → hemat 0, tak pernah negatif`);
sama(cepat.savingsWithAI >= 0, true, "penghematan tak pernah negatif");
const pas = calculateRoi({ ...ROI_DEFAULTS, minutesPerSearch: MINUTES_WITH_AI });
sama(pas.savingsWithAI, 0, "pencarian tepat 3 menit → impas, hemat 0");
sama(
  calculateRoi({ ...ROI_DEFAULTS, employees: ROI_DEFAULTS.employees * 2 }).savingsWithAI,
  r.savingsWithAI * 2,
  "dua kali karyawan → dua kali penghematan (linear)",
);
sama(
  calculateRoi({ ...ROI_DEFAULTS, minutesPerSearch: 30 }).savingsWithAI >
    calculateRoi({ ...ROI_DEFAULTS, minutesPerSearch: 20 }).savingsWithAI,
  true,
  "pencarian lebih lama → penghematan lebih besar (monoton)",
);
sama(ANSWERABLE_SHARE < 1, true, "asumsi AI tidak menjawab 100% pertanyaan");
sama(REALIZED_SHARE < 1, true, "asumsi tidak semua menit hemat jadi output");
sama(ESTIMATE_NOTE.id.startsWith("*") && ESTIMATE_NOTE.en.startsWith("*"), true, "catatan estimasi ada di dua bahasa");
sama(/bukan hasil pengukuran/.test(ESTIMATE_NOTE.id), true, "catatan jujur menyebut ini asumsi, bukan pengukuran");

console.log("\nBATAS UPLOAD — upload-limits");
sama(MAX_UPLOAD_BYTES, 4 * 1024 * 1024, "4 MB");
sama(MAX_UPLOAD_MB, 4, "angka untuk salinan teks turut dari byte-nya, tak bisa melenceng");
sama(
  MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024,
  true,
  "di bawah plafon keras Vercel 4.5 MB — di atasnya request ditolak sebelum kode kita jalan",
);

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
