// Regression test untuk logika uang: harga, masa berlaku, dan batas paket.
//
// Menjalankan `src/lib/pricing.ts` dan `src/lib/plan-limits.ts` yang ASLI —
// bukan salinan, bukan mock. Keduanya kebetulan tidak punya satu pun `import`,
// jadi tidak ada database, jaringan, atau kerangka test yang perlu disiapkan;
// Node 22 menjalankan TypeScript-nya langsung lewat --experimental-strip-types.
// Itu sebabnya file ini ada di sini alih-alih menunggu Jest dipasang: seluruh
// ongkos masuknya satu file dan satu baris di package.json.
//
// Batasnya jujur: `subscription.ts` dan `payment.ts` TIDAK tercakup. Keduanya
// mengimpor @/lib/db, dan repo ini tidak punya database staging. Yang diuji di
// sini adalah aritmetika keputusannya, bukan penulisannya ke tabel.
//
// Jalankan: npm run test:pricing
//
// Semua kasus di bawah menguji perilaku yang SUDAH pernah salah atau yang akan
// berubah sendiri pada tanggal tertentu. Tidak ada yang ditulis untuk mengejar
// angka coverage.

import { getLimits, isUnderLimit, PLAN_LIMITS } from "../src/lib/plan-limits.ts";
import {
  computeRenewedExpiry,
  getEffectiveSubscription,
  getPlanPrice,
  isPlanAllowedFor,
  isPromoActive,
  isSubscriptionActive,
  planRank,
  planRankInForce,
  canUseAiAnswers,
  formatRupiah,
  GRACE_PERIOD_DAYS,
  NORMAL_PRICES,
  PROMO_PRICES,
  PROMO_ENDS_AT,
} from "../src/lib/pricing.ts";

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

// Pembanding tanggal tersendiri, karena `sama(a.getTime(), b.getTime())` gagal
// dengan pesan berisi dua angka epoch — persis informasi yang tidak menolong
// orang yang sedang membaca kenapa test-nya merah.
const samaTanggal = (aktual: Date, harusnya: Date, nama: string) => {
  const ok = aktual.getTime() === harusnya.getTime();
  laporkan(ok, nama, ok ? "" : ` — dapat ${aktual.toDateString()}, harusnya ${harusnya.toDateString()}`);
};

const HARI = 24 * 60 * 60 * 1000;

// Tanggal dibangun dengan konstruktor waktu LOKAL, bukan string ISO. addOneMonth
// sengaja memakai getDate()/setMonth() yang berbasis waktu lokal (alasannya ada
// di komentar fungsinya: plan_expires_at adalah `timestamp` tanpa zona waktu).
// Menulis "2026-01-31T00:00:00Z" akan membuat test ini lulus di UTC dan gagal di
// mesin developer yang zonanya di belakang UTC — kegagalan yang tidak ada
// hubungannya dengan bug apa pun.
const tgl = (y: number, bulan1: number, hari: number) => new Date(y, bulan1 - 1, hari);

console.log("\nPERPANJANGAN — computeRenewedExpiry");
{
  // Bug perpanjangan ganda dulu hidup di sekitar sini: yang menentukan adalah
  // apakah basisnya masa berlaku yang tersisa atau hari ini.
  const skrg = tgl(2026, 8, 30);

  samaTanggal(computeRenewedExpiry(tgl(2026, 9, 20), skrg), tgl(2026, 10, 20),
    "langganan masih aktif → sisa hari ditumpuk, bukan dibuang");
  samaTanggal(computeRenewedExpiry(tgl(2026, 1, 1), skrg), tgl(2026, 9, 30),
    "sudah kedaluwarsa → mulai sebulan dari hari ini");
  samaTanggal(computeRenewedExpiry(null, skrg), tgl(2026, 9, 30),
    "tanpa tanggal kedaluwarsa (akun uji) → dapat siklus sebulan saat pertama bayar");

  // Pembayaran yang mendarat tepat di detik kedaluwarsa dihitung sebagai sudah
  // lewat (perbandingannya `>`), jadi basisnya `now`. Keduanya kebetulan sama
  // di sini, yang justru alasan kasus ini ditulis: kalau perbandingannya
  // dibalik jadi `>=` tidak ada yang berubah, dan itu memang benar.
  const persis = tgl(2026, 8, 30);
  samaTanggal(computeRenewedExpiry(persis, persis), tgl(2026, 9, 30),
    "bayar persis di detik kedaluwarsa → satu bulan dari saat itu");
}

console.log("\nPERPANJANGAN — luapan akhir bulan (bug yang sudah pernah ada)");
{
  // setMonth() polos mengubah 31 Januari + 1 bulan jadi "31 Februari", yang
  // digulirkan JavaScript ke 2/3 Maret. Setiap perpanjangan dari tanggal 29 ke
  // atas akan membagikan hari gratis dan makin melenceng tiap siklus.
  const kasus: [string, Date, Date][] = [
    ["31 Jan → 28 Feb (tahun biasa)", tgl(2027, 1, 31), tgl(2027, 2, 28)],
    ["31 Jan → 29 Feb (kabisat)",     tgl(2028, 1, 31), tgl(2028, 2, 29)],
    ["31 Des → 31 Jan (lintas tahun)", tgl(2026, 12, 31), tgl(2027, 1, 31)],
    ["30 Apr → 30 Mei",                tgl(2026, 4, 30), tgl(2026, 5, 30)],
    ["15 Mar → 15 Apr (kasus biasa)",  tgl(2026, 3, 15), tgl(2026, 4, 15)],
  ];
  for (const [nama, dari, harusnya] of kasus) {
    // `dari` dipakai sebagai masa berlaku yang MASIH aktif, dengan `now` sehari
    // sebelumnya, supaya jalur "tumpuk dari tanggal kedaluwarsa" yang diuji.
    const skrg = new Date(dari.getTime() - HARI);
    samaTanggal(computeRenewedExpiry(dari, skrg), harusnya, nama);
  }
}

console.log("\nSTATUS LANGGANAN — getEffectiveSubscription");
{
  const skrg = tgl(2026, 8, 30);
  const status = (p: string | null, exp: Date | null) => getEffectiveSubscription(p, exp, skrg);

  sama(status("starter", null).status, "active", "starter tanpa tanggal → aktif");
  sama(status("starter", tgl(2026, 1, 1)).status, "expired",
    "starter DENGAN tanggal lampau → pelanggan yang lapse, bukan pengguna gratis biasa");

  sama(status("custom", null).status, "active",
    "paket berbayar tanpa tanggal kedaluwarsa → aktif selamanya (akun negosiasi)");
  sama(status("custom", null).plan, "custom", "…dan paketnya tidak diturunkan");

  sama(status("professional", tgl(2026, 12, 1)).status, "active", "masih lama → aktif");
  sama(status("professional", tgl(2026, 9, 5)).status, "expiring",
    "kurang dari 7 hari lagi → memperingatkan");

  // Batas masa tenggang. Ini yang membedakan pelanggan yang transfernya telat
  // dua hari dari pelanggan yang benar-benar berhenti.
  const lewat3hari = new Date(skrg.getTime() - 3 * HARI);
  sama(status("professional", lewat3hari).status, "grace", "3 hari lewat → masih dalam tenggang");
  sama(status("professional", lewat3hari).plan, "professional",
    "…dan batas paket berbayar MASIH berlaku selama tenggang");

  const lewat8hari = new Date(skrg.getTime() - 8 * HARI);
  sama(status("professional", lewat8hari).status, "expired", "8 hari lewat → tenggang habis");
  sama(status("professional", lewat8hari).plan, "starter",
    "…dan batas yang berlaku turun ke starter");
  sama(status("professional", lewat8hari).purchasedPlan, "professional",
    "…tapi paket yang DIBELI tetap diingat, untuk pesan ajakan perpanjang");

  // Tepat di ujung tenggang: perbandingannya `now < graceEndsAt`, jadi detik
  // ke-7 x 24 jam sudah kedaluwarsa, bukan masih tenggang.
  const persisUjungTenggang = new Date(skrg.getTime() - GRACE_PERIOD_DAYS * HARI);
  sama(status("professional", persisUjungTenggang).status, "expired",
    `tepat ${GRACE_PERIOD_DAYS} hari lewat → sudah kedaluwarsa, bukan tenggang`);
}

console.log("\nPENURUNAN PAKET — planRankInForce");
{
  const skrg = tgl(2026, 8, 30);

  // Ini penjaga yang melindungi kontrak yang ditandatangani manual: tanpa
  // cabang null-expiry di planRankInForce, akun `custom` terbaca peringkat 0
  // dan checkout Professional Rp200rb menimpanya diam-diam.
  sama(planRankInForce("custom", null, skrg), planRank("custom"),
    "custom tanpa tanggal → peringkat penuh, tidak bisa ditimpa pembelian self-serve");
  laporkan(planRank("custom") > planRank("enterprise"),
    "custom berperingkat di atas enterprise");

  sama(planRankInForce("professional", tgl(2026, 12, 1), skrg), planRank("professional"),
    "professional aktif → peringkat penuh");
  sama(planRankInForce("professional", tgl(2026, 1, 1), skrg), 0,
    "professional kedaluwarsa → peringkat 0, jadi pelanggan bisa kembali dengan paket lebih kecil");
  sama(planRankInForce(null, null, skrg), 0, "tanpa paket → 0");
  sama(planRank("paket-yang-tidak-ada"), 0, "paket tak dikenal → 0, tidak melempar error");

  // isSubscriptionActive menjawab pertanyaan yang berbeda dari planRankInForce:
  // "apakah ada periode berbayar yang masih berjalan", tanpa cabang khusus untuk
  // akun tanpa tanggal. Perbedaan itu disengaja, jadi diuji terpisah — kalau
  // suatu saat keduanya disamakan, kasus di bawah ini yang akan protes.
  laporkan(isSubscriptionActive("professional", tgl(2026, 12, 1), skrg),
    "berbayar + tanggal di depan → aktif");
  laporkan(!isSubscriptionActive("professional", tgl(2026, 1, 1), skrg),
    "berbayar + tanggal lampau → tidak aktif");
  laporkan(!isSubscriptionActive("custom", null, skrg),
    "berbayar TANPA tanggal → tidak aktif di sini (sengaja beda dari planRankInForce)");
  laporkan(!isSubscriptionActive("starter", tgl(2026, 12, 1), skrg),
    "starter dengan tanggal di depan → tetap tidak aktif, starter bukan paket berbayar");
}

console.log("\nPROMO — batas 31 Desember 2026");
{
  // Harga promo berbalik ke normal dengan sendirinya. Tidak ada deploy yang
  // menandainya, jadi ini satu-satunya hal yang akan memberi tahu kalau
  // tanggalnya bergeser tanpa sengaja.
  const sedetikSebelum = new Date(PROMO_ENDS_AT.getTime() - 1000);
  const sedetikSesudah = new Date(PROMO_ENDS_AT.getTime() + 1000);

  laporkan(isPromoActive(sedetikSebelum), "sedetik sebelum batas → promo masih jalan");
  laporkan(!isPromoActive(sedetikSesudah), "sedetik sesudah batas → promo berhenti");
  laporkan(!isPromoActive(PROMO_ENDS_AT), "tepat di batas → sudah berhenti (perbandingan `<`)");

  for (const paket of ["personal", "professional", "enterprise"] as const) {
    sama(getPlanPrice(paket, sedetikSebelum), PROMO_PRICES[paket], `harga promo ${paket}`);
    sama(getPlanPrice(paket, sedetikSesudah), NORMAL_PRICES[paket], `harga normal ${paket}`);
    laporkan(PROMO_PRICES[paket] < NORMAL_PRICES[paket],
      `promo ${paket} memang lebih murah dari normal`);
  }
}

console.log("\nTIPE AKUN — isPlanAllowedFor");
{
  laporkan(isPlanAllowedFor("personal", "individual"), "individu boleh Personal");
  laporkan(!isPlanAllowedFor("professional", "individual"),
    "individu DITOLAK Professional — 49 kursi yang tak ada isinya");
  laporkan(!isPlanAllowedFor("personal", "company"),
    "perusahaan DITOLAK Personal — paket 1 kursi untuk workspace berisi banyak orang");
  laporkan(isPlanAllowedFor("enterprise", "company"), "perusahaan boleh Enterprise");
}

console.log("\nJAWABAN AI — canUseAiAnswers");
{
  laporkan(!canUseAiAnswers("starter"), "starter tidak dapat jawaban AI");
  laporkan(!canUseAiAnswers(null), "tanpa paket tidak dapat jawaban AI");
  for (const paket of ["personal", "professional", "enterprise", "custom"]) {
    laporkan(canUseAiAnswers(paket), `${paket} dapat jawaban AI`);
  }
}

console.log("\nBATAS PAKET — plan-limits");
{
  // Batas persis. isUnderLimit dipakai sebelum menambah karyawan/dokumen, jadi
  // `current === max` HARUS menolak — kalau tidak, tiap paket diam-diam
  // menjual satu kursi lebih banyak dari yang tertulis di halaman harga.
  laporkan(isUnderLimit(9, 10), "9 dari 10 → boleh");
  laporkan(!isUnderLimit(10, 10), "10 dari 10 → DITOLAK (kalau lolos, tiap paket bocor 1 kursi)");
  laporkan(!isUnderLimit(11, 10), "11 dari 10 → ditolak");
  laporkan(isUnderLimit(9999, -1), "-1 berarti tak terbatas");
  laporkan(!isUnderLimit(0, 0), "batas 0 menolak semuanya");

  sama(getLimits("paket-yang-tidak-ada"), PLAN_LIMITS.starter,
    "paket tak dikenal jatuh ke starter, bukan undefined — ini yang membuat kolom plan rusak gagal-tertutup");

  // Enterprise harus lebih longgar dari Professional di setiap sumbu, kalau
  // tidak tabel harganya berbohong. Batas dokumen & karyawan Enterprise baru
  // saja diturunkan (500→300, 200→100), yang persis kondisi ketika urutan
  // seperti ini paling mudah rusak tanpa disadari.
  for (const sumbu of ["maxDocuments", "maxEmployees", "maxQuestionsPerDay"] as const) {
    laporkan(PLAN_LIMITS.enterprise[sumbu] > PLAN_LIMITS.professional[sumbu],
      `enterprise.${sumbu} > professional.${sumbu}`,
      ` — ${PLAN_LIMITS.enterprise[sumbu]} vs ${PLAN_LIMITS.professional[sumbu]}`);
  }
  laporkan(PLAN_LIMITS.professional.maxDocuments > PLAN_LIMITS.starter.maxDocuments,
    "professional.maxDocuments > starter.maxDocuments");
}

console.log("\nFORMAT — formatRupiah");
{
  sama(formatRupiah(299000, "id"), "Rp 299.000", "format Indonesia memakai titik");
  sama(formatRupiah(299000, "en"), "Rp 299,000", "format Inggris memakai koma");
}

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus gagal`);
process.exit(gagal === 0 ? 0 : 1);
