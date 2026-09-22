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
  isSubscriptionActive,
  planRank,
  planRankInForce,
  canUseAiAnswers,
  formatRupiah,
  GRACE_PERIOD_DAYS,
  NORMAL_PRICES,
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
  // `isPilot` wajib di tipe SubscriptionInput supaya kode aplikasi tidak bisa
  // lupa mengisinya; di sini diberi default false agar kasus lama tetap ringkas.
  const status = (p: string | null, exp: Date | null, isPilot = false) =>
    getEffectiveSubscription({ plan: p, expiresAt: exp, isPilot }, skrg);

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

  // PILOT: janji di halaman harga adalah "gratis 7 hari", jadi hari ke-8 harus
  // benar-benar mati. Masa tenggang ada untuk menutup transfer yang sedang
  // jalan; pilot tidak punya transfer, jadi tenggang di sini = 7 hari gratis
  // ekstra yang tidak pernah dijanjikan.
  const lewat1hari = new Date(skrg.getTime() - HARI);
  sama(status("professional", lewat1hari, true).status, "expired",
    "pilot lewat 1 hari → langsung kedaluwarsa, TANPA tenggang");
  sama(status("professional", lewat1hari, true).plan, "starter",
    "…dan batasnya langsung turun ke starter: mau lanjut berarti berlangganan");
  // Pasangan pembanding di tanggal yang sama persis. Kalau suatu saat cabang
  // pilot hilang, baris inilah yang tetap hijau sementara dua baris di atas
  // merah — yang membuktikan benderanya yang bekerja, bukan tanggalnya.
  sama(status("professional", lewat1hari, false).status, "grace",
    "tanggal yang sama tapi BUKAN pilot → tetap dapat tenggang (pelanggan berbayar)");

  sama(status("professional", lewat1hari, true).graceEndsAt, null,
    "pilot tidak punya akhir tenggang untuk ditampilkan");
  sama(status("professional", tgl(2026, 9, 5), true).plan, "professional",
    "selama pilot masih berjalan → akses penuh paket yang dipilotkan");

  // Baris ini menutup satu-satunya cara is_pilot bisa jadi bencana: baris yang
  // ditandai pilot tapi tanpa tanggal akhir = paket berbayar gratis selamanya.
  sama(status("professional", null, true).plan, "starter",
    "pilot tanpa tanggal akhir → gagal-tertutup ke starter, bukan gratis selamanya");
}

console.log("\nPENURUNAN PAKET — planRankInForce");
{
  const skrg = tgl(2026, 8, 30);

  // Ini penjaga yang melindungi kontrak yang ditandatangani manual: tanpa
  // cabang null-expiry di planRankInForce, akun `custom` terbaca peringkat 0
  // dan checkout Professional Rp200rb menimpanya diam-diam.
  const peringkat = (p: string | null, exp: Date | null, isPilot = false) =>
    planRankInForce({ plan: p, expiresAt: exp, isPilot }, skrg);

  sama(peringkat("custom", null), planRank("custom"),
    "custom tanpa tanggal → peringkat penuh, tidak bisa ditimpa pembelian self-serve");
  laporkan(planRank("custom") > planRank("enterprise"),
    "custom berperingkat di atas enterprise");

  sama(peringkat("professional", tgl(2026, 12, 1)), planRank("professional"),
    "professional aktif → peringkat penuh");
  sama(peringkat("professional", tgl(2026, 1, 1)), 0,
    "professional kedaluwarsa → peringkat 0, jadi pelanggan bisa kembali dengan paket lebih kecil");
  sama(peringkat(null, null), 0, "tanpa paket → 0");

  // Kalau pilot dihitung berperingkat penuh, pilot Enterprise justru mengunci
  // customer: penjaga penurunan paket menolak pembelian Professional mereka —
  // di checkout dengan penolakan membingungkan, atau di webhook, yang menerima
  // uangnya dan tidak memberikan apa pun.
  sama(peringkat("enterprise", tgl(2026, 12, 1), true), 0,
    "pilot yang sedang berjalan → peringkat 0: tidak ada pembelian yang perlu dilindungi");
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

console.log("\nHARGA — satu harga, tanpa promo");
{
  // Angka persis, bukan sekadar "lebih besar dari nol". Ini nominal yang
  // benar-benar dikirim ke Midtrans sebagai gross_amount, jadi kesalahan ketik
  // satu nol di sini adalah pelanggan tertagih Rp 450rb atau Rp 45jt. Satu-
  // satunya hal yang akan menangkapnya sebelum pelanggan yang menangkapnya.
  sama(NORMAL_PRICES.professional, 1_500_000, "Pro (plan id `professional`) Rp 1,5jt");
  sama(NORMAL_PRICES.enterprise, 4_500_000, "Enterprise (plan id `enterprise`) Rp 4,5jt");
  sama(NORMAL_PRICES.personal, 119_000, "Personal Rp 119rb");

  // Promo sudah dihapus. getPlanPrice masih menerima tanggal supaya promo
  // berjangka bisa dipasang lagi tanpa menyentuh pemanggilnya, tetapi hari ini
  // tanggal tidak boleh mengubah apa pun — termasuk tanggal yang dulu menjadi
  // batas promo, yang persis kondisi paling mungkin tersisa setengah jalan.
  const dulu = new Date("2026-01-01T00:00:00Z");
  const bekasBatasPromo = new Date("2026-12-31T17:00:00Z");
  const nanti = new Date("2030-01-01T00:00:00Z");
  for (const paket of ["personal", "professional", "enterprise"] as const) {
    for (const [kapan, nama] of [[dulu, "dulu"], [bekasBatasPromo, "bekas batas promo"], [nanti, "nanti"]] as const) {
      sama(getPlanPrice(paket, kapan), NORMAL_PRICES[paket], `${paket} harganya sama ${nama}`);
    }
  }

  // Tangga harganya harus naik, dan harga per kursinya harus TURUN. Yang kedua
  // itu alasan seluruh perubahan harga ini ada: paket yang lebih mahal wajib
  // lebih murah per orang, kalau tidak pembeli yang menghitung akan selalu
  // memilih paket kecil dan paket besar tidak pernah laku.
  laporkan(NORMAL_PRICES.enterprise > NORMAL_PRICES.professional,
    "Enterprise lebih mahal dari Pro");
  const perKursi = (p: "professional" | "enterprise") =>
    NORMAL_PRICES[p] / PLAN_LIMITS[p].maxEmployees;
  laporkan(perKursi("enterprise") < perKursi("professional"),
    "Enterprise lebih murah PER KURSI dari Pro",
    ` — Rp ${perKursi("enterprise").toLocaleString("id-ID")} vs Rp ${perKursi("professional").toLocaleString("id-ID")}`);
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
  // tidak tabel harganya berbohong. Kedua paket baru saja diubah bersamaan
  // (Professional 100→300 dokumen tetapi 50→25 karyawan, Enterprise 300→1.000
  // dan 100→150), dan satu sumbu yang bergerak ke arah berlawanan dari yang
  // lain persis kondisi ketika urutan seperti ini rusak tanpa disadari.
  for (const sumbu of ["maxDocuments", "maxEmployees", "maxQuestionsPerDay"] as const) {
    laporkan(PLAN_LIMITS.enterprise[sumbu] > PLAN_LIMITS.professional[sumbu],
      `enterprise.${sumbu} > professional.${sumbu}`,
      ` — ${PLAN_LIMITS.enterprise[sumbu]} vs ${PLAN_LIMITS.professional[sumbu]}`);
  }
  laporkan(PLAN_LIMITS.professional.maxDocuments > PLAN_LIMITS.starter.maxDocuments,
    "professional.maxDocuments > starter.maxDocuments");
}

console.log("\nBATAS PAKET — BYOK (kunci API milik pelanggan sendiri)");
{
  // Pertanyaan dibayar ke Groq/Google oleh pelanggan, jadi tidak ada lagi
  // alasan biaya untuk membatasinya.
  const byok = getLimits("enterprise", true);
  laporkan(byok.maxQuestionsPerDay === -1, "BYOK melepas kuota harian");
  laporkan(byok.maxQuestionsPerMonth === -1, "BYOK melepas kuota bulanan");
  laporkan(byok.maxQuestionsPerDayPerUser === -1,
    "BYOK melepas rem per-user — rem itu hanya melindungi kolam bersama, dan kolamnya kini milik mereka");

  // Dokumen dan kursi TIDAK ikut lepas: chunk + vektor tetap duduk di database
  // kita, dan kursi adalah dasar penetapan harga paketnya.
  laporkan(byok.maxDocuments === PLAN_LIMITS.enterprise.maxDocuments,
    "BYOK TIDAK mengubah batas dokumen — storage tetap biaya kita");
  laporkan(byok.maxEmployees === PLAN_LIMITS.enterprise.maxEmployees,
    "BYOK TIDAK mengubah batas kursi — kursi adalah dasar harga paket");

  // Yang membuat ini konsesi ke pelanggan berbayar, bukan jalan pintas
  // menembus paywall: paket gratis tetap 10/hari walau kuncinya dipasang.
  sama(getLimits("starter", true), PLAN_LIMITS.starter,
    "starter + kunci sendiri tetap starter — kalau lolos, siapa pun bisa melewati paywall dengan menempelkan kunci API");
  sama(getLimits("paket-yang-tidak-ada", true), PLAN_LIMITS.starter,
    "paket tak dikenal + kunci sendiri tetap starter, bukan tanpa batas");

  // Tanpa kunci sendiri, tidak ada yang berubah dari perilaku lama.
  sama(getLimits("enterprise"), PLAN_LIMITS.enterprise,
    "tanpa BYOK, enterprise tetap memakai batas paketnya");
}

console.log("\nFORMAT — formatRupiah");
{
  sama(formatRupiah(299000, "id"), "Rp 299.000", "format Indonesia memakai titik");
  sama(formatRupiah(299000, "en"), "Rp 299,000", "format Inggris memakai koma");
}

console.log(gagal === 0 ? "\n✓ semua kasus lulus" : `\n✗ ${gagal} kasus gagal`);
process.exit(gagal === 0 ? 0 : 1);
