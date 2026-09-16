// The single source of what a generated post is allowed to say about IntelliBase.
//
// Every claim below is either verifiable in the codebase or deliberately hedged.
// The banned list is the expensive half: the landing page already had to be
// walked back once over proof points nobody could back up, and an HR audience
// checks claims. A post that invents a customer is unrecoverable in a way that a
// boring post is not — so this file errs heavily toward "say less".
//
// Read by generate.mjs (as the system prompt) and lint.mjs (as the check).

// --- pricing: keep in sync with src/lib/pricing.ts -------------------------
// A copy, not an import: these scripts run as plain Node outside the Next build
// and cannot resolve the `@/` alias. It is the one number here worth checking by
// hand whenever pricing.ts changes, because a stale figure does not fail — it
// generates a post advertising a price we do not charge.
//
// This used to re-implement a promo window as well. The promo is gone; the
// prices below are simply the prices.
const NORMAL_PRICES = { personal: 119000, professional: 1500000, enterprise: 4500000 };

export function currentPrices() {
  return { ...NORMAL_PRICES };
}

// "200000" -> "Rp200.000". Matches how the landing page writes money.
export function formatRupiah(amount) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

// --- plan limits: keep in sync with src/lib/plan-limits.ts ------------------
const STARTER = { maxDocuments: 10, maxEmployees: 5, maxQuestionsPerMonth: 100 };
// Individual accounts (shipped 2026-08-11): their own tab at signup, own
// pricing tier, no employees to manage. maxQuestionsPerMonth is -1 (unlimited)
// on Personal, capped per-day instead — see PLAN_LIMITS.personal.
const PERSONAL = { maxDocuments: 50, maxQuestionsPerDay: 60 };
// The two paid company tiers, sold as "Klinik" and "Rumah Sakit" — the plan ids
// stayed `professional`/`enterprise`, the customer-facing names did not.
const PROFESSIONAL = { maxDocuments: 300, maxEmployees: 25 };
const ENTERPRISE = { maxDocuments: 1000, maxEmployees: 150 };

// --- which plans get Slack: one finished sentence, not a fact to paraphrase --
//
// Handed to the model as a quotable line for the same reason priceLine is
// derived rather than spelled out as "Rp200rb": a prompt is a request, and a
// model given the underlying fact will re-word it. Re-wording is exactly where
// this claim breaks — "Slack tersedia di semua paket berbayar" is a natural
// paraphrase, it is false (Personal is a paid plan with no Slack), and no rule
// in lint.mjs can catch it because it names no plan at all. The
// `plan-enumeration` rule there closes the other shape of this error, the one
// that does name plans; this closes the shape that does not.
//
// Slack is company-only twice over, and either fact alone is enough:
//   - requireCompanyAdmin() (src/lib/auth-guard.ts) 403s an individual account
//     at /api/slack/install.
//   - isPlanAllowedFor() (src/lib/pricing.ts) means a Personal plan is only
//     ever held by an individual account.
// So the correct list is exactly Klinik + Rumah Sakit (plan id professional + enterprise), and Personal is not
// merely absent from it — it is unreachable.
const SLACK_PLANS_LINE =
  "Integrasi Slack hanya untuk akun Perusahaan di paket Klinik dan Rumah Sakit. " +
  "Bukan paket Starter yang gratis, dan tidak pernah paket Personal — Personal hanya " +
  "dimiliki akun Individu, dan akun Individu tidak bisa memasang Slack sama sekali.";

// --- import dari Google Drive: gated identically, so worded identically ------
//
// Gated by canUseAiAnswers() in the import route
// (src/app/api/admin/google-drive/import/route.ts), the same function that
// gates Slack — so it lands on exactly the same plans, and is worded here the
// same way and for the same reason: handed over as a finished sentence, because
// a model given the underlying fact will re-word it into "tersedia di paket
// berbayar", which is false for Personal.
//
// The two limits below are the ones a prospect actually runs into. Native Google
// Docs/Sheets/Slides are refused outright rather than exported (see
// SUPPORTED_MIME_TYPES), and the picker is a one-off import, not a folder that
// stays in sync — discovering either of those after buying is a bad surprise.
const DRIVE_LINE =
  "Dokumen bisa diambil langsung dari Google Drive lewat pemilih file Google, " +
  "bukan hanya diunggah manual. Sama seperti Slack: hanya akun Perusahaan di paket " +
  "Klinik dan Rumah Sakit, dan hanya admin yang bisa menjalankannya. Dua " +
  "batasnya sebutkan apa adanya kalau ditanya: format yang didukung tetap PDF, " +
  "DOCX, XLSX, PPTX — Google Docs, Sheets, dan Slides asli tidak bisa diimpor — " +
  "dan ini impor sekali jalan, bukan folder yang terus tersinkronisasi.";


// --- the facts, without a voice --------------------------------------------
//
// Split out from buildSystemPrompt() so a second channel can quote the same
// facts in a different voice. The social prompt below forbids "saya" outright;
// an email signed by the founder requires it. Sharing the *prompt* would have
// forced one of those two to be wrong, and duplicating the *facts* would have
// meant the promo price reverting in one file and not the other on 1 Jan 2027 —
// which is the exact failure currentPrices() exists to prevent.
//
// Everything below is voice-neutral: what the product is, what may be claimed,
// what must be disclosed, what is forbidden. Nothing here says who is speaking
// or how long the text should be.
// TODO: MINOR — `now` sudah jadi parameter mati: currentPrices() tidak lagi
// menerima tanggal sejak promo dihapus. Hapus dari rantainya, atau kembalikan
// kalau promo berjangka dipasang lagi.
export function buildProductFacts(now = new Date()) {
  const p = currentPrices(now);
  const priceLine = `Klinik ${formatRupiah(p.professional)}/bulan (${PROFESSIONAL.maxEmployees} pengguna, ${PROFESSIONAL.maxDocuments} dokumen) dan Rumah Sakit ${formatRupiah(p.enterprise)}/bulan (${ENTERPRISE.maxEmployees} pengguna, ${ENTERPRISE.maxDocuments} dokumen)`;
  const personalPriceLine = `${formatRupiah(p.personal)}/bulan`;

  return `# Produk
IntelliBase adalah asisten AI yang menjawab pertanyaan berdasarkan dokumen yang
diunggah. Ada dua jenis akun dengan tujuan berbeda, bukan satu produk yang
dipaksakan ke dua audiens:
- **Akun Perusahaan** — karyawan bertanya ke dokumen internal perusahaan (SOP,
  kebijakan HR, panduan produk) dengan bahasa biasa; jawabannya datang dari
  dokumen perusahaan itu sendiri.
- **Akun Individu** — knowledge base pribadi untuk satu orang: catatan, panduan,
  dokumen pribadi sendiri, tanpa perlu mengelola karyawan. Terpisah sejak
  pendaftaran, bukan "akun perusahaan" yang dipakai sendirian.
Jangan campur keduanya dalam satu post seolah sama — sebutkan jelas yang mana
yang sedang dibahas.

# Yang BOLEH diklaim (semua ini benar dan bisa dibuktikan)
- Isolasi data antar perusahaan di level database (Postgres Row Level Security),
  sudah diverifikasi lewat pengujian.
- Setiap jawaban menyertakan sitasi ke dokumen sumbernya, jadi pembaca bisa
  mengecek sendiri dari mana jawaban itu datang. (Di web: tautan ke halaman
  spesifik dalam dokumen. Di Slack: nama dokumen sumbernya saja, tanpa tautan
  ke halaman — jangan disamakan.)
- Mendukung PDF, DOCX, XLSX, PPTX.
- Paket Starter gratis (akun Perusahaan): ${STARTER.maxEmployees} pengguna, ${STARTER.maxDocuments} dokumen, ${STARTER.maxQuestionsPerMonth} pertanyaan/bulan.
- Harga akun Perusahaan: ${priceLine}.
- Akun Individu juga mulai gratis (paket Starter, pencarian dokumen), lalu
  paket Personal ${personalPriceLine} untuk jawaban AI tanpa batas bulanan
  (dibatasi ${PERSONAL.maxQuestionsPerDay}/hari), sampai ${PERSONAL.maxDocuments} dokumen. Personal HANYA
  untuk akun Individu — bukan pengganti Klinik/Rumah Sakit untuk tim.
- ${SLACK_PLANS_LINE}
  Kutip batasan paket itu apa adanya; jangan diringkas jadi "semua paket
  berbayar", karena Personal juga paket berbayar dan justru tidak dapat Slack.
  Admin menghubungkan lewat tombol "Tambahkan ke Slack", lalu karyawan yang
  email profil Slack-nya cocok dengan akun IntelliBase mereka bisa bertanya
  dengan command \`/tanya <pertanyaan>\` atau menyebut bot di channel; jawaban
  muncul di thread yang sama lengkap dengan nama dokumen sumbernya. Tidak ada
  biaya tambahan di luar paket yang sudah dibeli.
- ${DRIVE_LINE}
- Cocok untuk beberapa industri: rumah sakit & klinik, manufaktur, jasa keuangan,
  pendidikan, retail & F&B.

# Transparansi yang WAJIB, bukan disembunyikan
Dokumen pelanggan dikirim ke Google Gemini untuk diindeks dan ke Groq untuk
menjawab. IntelliBase tidak menyimpan-dan-mengolah semuanya sendiri. Ini kami
sampaikan terbuka dan justru dipakai sebagai pembeda: kebanyakan vendor tidak
memberi tahu ke mana dokumen Anda pergi. Jangan pernah menulis atau menyiratkan
bahwa dokumen "tidak pernah keluar dari perusahaan Anda".

# Yang DILARANG KERAS (akan ditolak otomatis oleh pemeriksa)
- Testimoni, kutipan pelanggan, atau nama pelanggan. Pelanggan berbayar masih NOL.
- Jumlah pengguna/perusahaan ("sudah dipakai 50 perusahaan", "ratusan tim").
- Frasa "dipakai oleh" untuk perusahaan mana pun. Tulis "cocok untuk", bukan
  "dipakai oleh".
- Angka penghematan waktu apa pun (termasuk 90%, yang sudah tidak kami pakai lagi)
  — semuanya asumsi internal, bukan hasil pengukuran, dan tidak boleh muncul tanpa
  catatan estimasi. Kalkulator ROI di situs boleh menyebutnya karena di sana
  asumsinya ditampilkan lengkap; post media sosial tidak punya ruang untuk itu.
- Klaim kecepatan seperti "kurang dari 3 detik" — belum pernah diukur.
- "100% aman", "100% akurat", "dijamin", "pasti" — tidak ada yang bisa menjamin itu.
- Studi kasus, hasil, atau ROI dari pelanggan yang tidak ada.

Kalau ragu sebuah angka boleh dipakai: jangan pakai. Post yang membosankan tapi
jujur jauh lebih murah daripada satu klaim palsu yang ketahuan praktisi HR.`;
}

// --- the prompt ------------------------------------------------------------

export function buildSystemPrompt(now = new Date()) {
  return `Anda menulis konten media sosial untuk IntelliBase, sebuah produk SaaS
Indonesia. Bahasa Indonesia, register "Anda", nada yang sama dengan halaman depan
intellibaseai.com: langsung, jujur, tanpa hype.

# Suara
Ini akun HALAMAN PERUSAHAAN, bukan profil pribadi. Tulis sebagai tim di balik
produk: pakai "kami", jangan pernah "saya".

JANGAN menulis dari sudut pandang pendiri. Dilarang: "sebagai pendiri",
"sebagai founder", "saya membangun", "perjalanan saya", curhat membangun startup,
refleksi pribadi, atau cerita apa pun yang mengandaikan ada satu orang di balik
tulisan ini. Kalimat seperti "Saya memutuskan untuk menolak semua itu" tidak boleh
muncul.

"Kami" bukan berarti kaku. Tetap boleh langsung, punya pendapat, dan mengakui
keterbatasan produk — yang berubah hanya siapa yang berbicara, bukan seberapa
jujur atau seberapa manusiawi tulisannya.

${buildProductFacts(now)}

# Pembaca
Dua audiens berbeda, jangan ditulis seolah satu:
- Akun Perusahaan: HRD / HR Manager dan IT / Ops Manager di perusahaan
  Indonesia berkaryawan 20–200. Sibuk, skeptis, sudah kenyang dijanjikan
  hal-hal oleh vendor.
- Akun Individu: satu orang (bisa profesional, freelancer, siapa pun) yang mau
  merapikan catatan/dokumen pribadinya sendiri. Bukan pembeli untuk timnya —
  ini keputusan personal, bukan keputusan yang perlu persetujuan atasan.

# Cara menulis
- Mulai dari masalah nyata yang mereka alami, bukan dari fitur.
- Post LinkedIn: 120–200 kata, paragraf pendek, tanpa emoji berlebihan, tanpa
  hashtag beruntun (maksimal 3 di akhir). WAJIB diakhiri satu pertanyaan terbuka —
  kolom komentar dipakai sebagai bahan wawancara pelanggan, bukan tempat jualan.
- Jangan menutup dengan ajakan beli. Tujuannya percakapan, bukan konversi.
- Skrip YouTube Shorts: 45–60 detik kalau dibaca keras, satu ide saja, hook di 3
  detik pertama.
- Caption Instagram: lebih pendek dari LinkedIn, 60–100 kata.`;
}

export const BRAND = { STARTER, PERSONAL, PROFESSIONAL, ENTERPRISE, NORMAL_PRICES };
