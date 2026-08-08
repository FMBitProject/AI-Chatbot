# Paket Video Facebook — 8 Agustus 2026

Tujuan tunggal paket ini: **mengundang orang membuka intellibaseai.com**, bukan sekadar
menaikkan jangkauan. Karena itu formatnya beda dari paket harian Hook+Value biasa —
di sini CTA ke website memang eksplisit di akhir video dan di caption.

Isi: 2 versi video (A: rekaman layar, B: b-roll Gemini) + caption masing-masing +
komentar pertama + varian hook + checklist upload.

> Ditulis manual, dicek dengan `node scripts/content/lint.mjs` — bersih dari seluruh
> kelas klaim terlarang di `scripts/content/brand-facts.mjs`.

**Rekomendasi:** pakai **Video A** sebagai post utama. Untuk audiens yang skeptis
(HRD/IT Manager), melihat produknya benar-benar menjawab jauh lebih mengundang klik
daripada b-roll orang kebingungan di kantor. Video B dipakai seminggu kemudian sebagai
variasi, atau kalau rekaman layar belum sempat dibuat.

---

## VIDEO A — Rekaman layar (utama)

**Durasi:** ±40 detik · **Rasio:** 9:16 (Reels) — ekspor ulang 1:1 untuk feed
**Yang direkam:** akun demo IntelliBase dengan **dokumen contoh, bukan dokumen asli
perusahaan mana pun**. Nama perusahaan di layar: pakai placeholder yang sudah ada di
produk ("PT. Maju Bersama"), jangan nama perusahaan nyata.

### Skrip (voiceover + aksi layar)

| Waktu | Aksi di layar | Voiceover (Bahasa Indonesia) | Teks di layar |
|---|---|---|---|
| 0–4 dtk | Folder Drive penuh file SOP, di-scroll cepat sampai tidak ada habisnya | "Perusahaan Anda punya SOP lengkap. Tapi karyawan tetap bertanya ke orang yang sama." | **SOP-nya ADA. TETAP DITANYAKAN.** |
| 4–11 dtk | Halaman upload IntelliBase; drag 3 file (PDF, DOCX, XLSX); indikator proses indexing | "Jadi kami buat begini: masukkan dokumen internal Anda — PDF, DOCX, XLSX, PPTX." | UPLOAD DOKUMEN INTERNAL |
| 11–20 dtk | Ketik pertanyaan di kolom chat: *"Berapa hari cuti tahunan dan bagaimana cara mengajukannya?"* → jawaban mengalir | "Karyawan bertanya pakai bahasa sehari-hari, bukan kata kunci." | TANYA PAKAI BAHASA BIASA |
| 20–29 dtk | **Kursor menyorot sitasi di bawah jawaban, lalu klik** → dokumen sumber terbuka di halaman yang dimaksud | "Setiap jawaban membawa sitasi ke dokumen sumbernya. Klik, dan Anda lihat sendiri dari mana jawaban itu diambil. Yang tidak bisa dicek, jangan dipercaya." | ADA SITASINYA. BISA DICEK. |
| 29–35 dtk | Potongan halaman keamanan/tentang; kalimat singkat soal pemisahan data | "Data antar perusahaan dipisah di level database. Dokumen diindeks lewat Google Gemini dan dijawab dengan Groq — itu kami sampaikan terbuka." | TERBUKA SOAL KE MANA DOKUMEN ANDA PERGI |
| 35–40 dtk | Layar beku di halaman depan situs, URL besar | "Coba sendiri di intellibaseai.com. Gratis untuk lima karyawan, tanpa kartu kredit." | **intellibaseai.com** · GRATIS 5 KARYAWAN · TANPA KARTU KREDIT |

**Catatan pengambilan:**
- Detik 20–29 adalah inti video ini. Kalau durasi harus dipotong, potong bagian lain — klik
  sitasi yang membuka dokumen asli itulah yang membedakan post ini dari iklan AI kebanyakan.
- Rekam layar 60 fps lalu perlambat 0,9× saat jawaban mengalir; jangan dipercepat sampai
  teks tidak terbaca.
- Kalau tidak mau merekam suara: buang voiceover, jadikan seluruh baris "Voiceover" sebagai
  teks di layar dan tambah musik instrumental. Sebagian besar orang menonton Facebook tanpa suara.

### Caption Facebook — Video A

```
Karyawan Anda jarang membuka folder SOP. Mereka bertanya ke orang yang sama, setiap hari.

Bukan karena malas. Mencari satu aturan di dokumen 40 halaman memang lebih lama
daripada mengetik pesan ke rekan yang dianggap paling paham. Selama itu benar,
dokumentasi serapi apa pun akan tetap dilewati.

Kami membangun IntelliBase untuk memutus pola itu: dokumen internal Anda diindeks,
lalu karyawan bertanya dengan bahasa sehari-hari. Yang paling penting buat kami —
setiap jawaban membawa sitasi ke dokumen sumbernya, jadi bisa Anda cek sendiri
sebelum dipakai. Jawaban AI tanpa rujukan sumber tidak layak dipakai untuk urusan
kebijakan perusahaan.

Terbuka soal satu hal: dokumen dikirim ke Google Gemini untuk diindeks dan ke Groq
untuk menjawab. Kebanyakan vendor tidak memberi tahu itu. Data antar perusahaan
dipisah di level database.

Lihat sendiri cara kerjanya, upload satu dokumen dan ajukan lima pertanyaan:
👉 https://www.intellibaseai.com

Paket Starter gratis selamanya — 5 karyawan, 10 dokumen, tanpa kartu kredit.

Pertanyaan SOP apa yang paling sering masuk ke tim Anda minggu ini?

#HRIndonesia #SOPPerusahaan #AIuntukBisnis
```

### Komentar pertama (tempel begitu post terbit)

```
Kalau mau langsung mencoba dengan dokumen kantor sendiri: https://www.intellibaseai.com
Ingin lihat hitung-hitungan waktunya dulu? Kalkulator di https://www.intellibaseai.com/roi
memakai asumsi kami sendiri dan ditampilkan terbuka — silakan ganti angkanya dengan
kondisi tim Anda.
```

---

## VIDEO B — B-roll Gemini (variasi, tanpa rekam layar)

**Durasi:** ±26 detik · **Rasio:** 9:16 · 3 klip @ ±8–9 detik, disambung di CapCut.
Teks di layar **sengaja tidak diminta ke Gemini** (hurufnya masih sering berantakan) —
tambahkan sendiri. Voiceover direkam/di-generate terpisah lalu ditimpa di atas klip.

### Voiceover penuh (baca ±26 detik, ±70 kata)

> "Setiap hari, pertanyaan yang sama masuk ke tim HR Anda. Soal cuti, klaim medis,
> prosedur kerja. Jawabannya sebenarnya sudah ada di dokumen perusahaan — hanya saja
> terlalu lama dicari. Kami membuat IntelliBase supaya karyawan bisa bertanya langsung
> ke dokumen itu, dan setiap jawaban membawa sitasi ke sumbernya. Coba sendiri di
> intellibaseai.com, gratis untuk lima karyawan."

### PROMPT VIDEO 1 — 0–9 detik (paste ke Gemini)

```
Buat video realistis berdurasi 9 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Ruang kerja HR di kantor modern Jakarta. Seorang HR manager usia 30-40 tahun
duduk di mejanya, ponsel di tangan, notifikasi pesan terus berdatangan; ia menghela napas
pelan sambil melirik tumpukan map berkas di sudut meja.

KAMERA: satu shot tanpa potongan, dolly-in perlahan dari medium shot ke medium close-up.
PENCAHAYAAN: pagi hari, natural, hangat, cahaya jendela dari samping.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tampilan
layar ponsel maupun laptop yang terbaca, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar:** PERTANYAAN YANG SAMA. SETIAP HARI.

### PROMPT VIDEO 2 — 9–18 detik (paste ke Gemini)

```
Buat video realistis berdurasi 9 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Meja kerja kayu yang rapi di kantor modern Indonesia. Seorang karyawan usia 25-35
tahun membuka map berisi dokumen tebal, membalik halaman satu per satu mencari sesuatu,
lalu berhenti dan menegakkan badan seperti menemukan yang dicari.

KAMERA: satu shot tanpa potongan, dari atas meja (top-down) turun perlahan ke medium shot.
PENCAHAYAAN: siang hari, natural, bersih, bayangan lembut.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan
yang terbaca di kertas maupun di layar, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar:** JAWABANNYA ADA DI DOKUMEN — CUMA LAMA DICARI

### PROMPT VIDEO 3 — 18–26 detik (paste ke Gemini)

```
Buat video realistis berdurasi 8 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Kantor modern Jakarta yang terang. Dua rekan kerja usia 28-40 tahun berdiri
berdampingan menatap satu laptop, salah satunya mengangguk puas lalu tersenyum tipis;
suasana tenang, bukan euforia.

KAMERA: satu shot tanpa potongan, gerak lateral pelan dari kanan ke kiri berakhir pada
kedua wajah.
PENCAHAYAAN: sore hari, hangat keemasan dari jendela besar di belakang.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tampilan
layar laptop yang terbaca, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar:** intellibaseai.com — COBA GRATIS, 5 KARYAWAN

### Caption Facebook — Video B

```
Tim HR Anda menjawab pertanyaan yang sama setiap minggu: aturan cuti, klaim medis,
prosedur lembur.

Yang menarik, jawabannya hampir selalu sudah tertulis di dokumen perusahaan. Masalahnya
bukan dokumennya kurang lengkap, tapi mencarinya terlalu lama — sampai bertanya ke orang
terasa jalan tercepat.

Satu langkah yang bisa Anda mulai hari ini tanpa alat apa pun: catat 10 pertanyaan yang
paling sering masuk bulan ini, lalu satukan jawabannya di satu halaman yang bisa dibuka
siapa saja. Itu saja sudah memotong sebagian beban tim Anda.

Kalau ingin yang otomatis, itu yang kami kerjakan di IntelliBase: karyawan bertanya
dengan bahasa sehari-hari ke dokumen internal, dan setiap jawaban membawa sitasi ke
dokumen sumbernya supaya bisa diverifikasi.

Coba dengan dokumen Anda sendiri di 👉 https://www.intellibaseai.com
Starter gratis selamanya: 5 karyawan, 10 dokumen, tanpa kartu kredit.

Sepuluh pertanyaan tersering di kantor Anda — kira-kira apa nomor satunya?

#HRIndonesia #KnowledgeManagement #AIuntukBisnis
```

---

## Varian hook (3 detik pertama) untuk diuji

Ganti hanya baris pertama caption + teks layar pertama, sisanya biarkan sama:

1. **Beban orang kunci** — "Ada satu orang di kantor Anda yang ditanyai semua hal. Kalau dia cuti, operasional ikut melambat."
2. **Karyawan baru** — "Minggu pertama karyawan baru habis untuk menanyakan hal yang sudah tertulis di dokumen onboarding."
3. **SOP ganda** — "Dua versi SOP beredar di folder bersama dan tidak ada yang tahu mana yang berlaku."

Hook 1 paling cocok untuk Facebook: yang membacanya sering kali justru orang kunci itu sendiri.

---

## Checklist upload Facebook

- **Unggah video langsung ke Facebook** (native), jangan tempel tautan YouTube — video native
  jauh lebih jauh jangkauannya, dan tautan YouTube menggantikan tautan situs Anda.
- **Subtitle dibakar ke video** (burn-in). Sebagian besar orang menonton tanpa suara; kalau
  teksnya baru muncul di detik ke-5, hook-nya hilang.
- **Tautan tetap ditulis di caption**, bukan hanya di komentar pertama — sebagian pembaca tidak
  membuka komentar sama sekali. Komentar pertama dipakai sebagai penguat, bukan pengganti.
- **Tulis alamatnya sebagai teks juga** ("intellibaseai.com") selain tautan penuh, supaya tetap
  terbaca kalau pratinjau tautan tidak muncul.
- **Teks di layar pada 6 detik terakhir** wajib memuat alamat situs — banyak yang menonton
  sampai habis tanpa pernah membaca caption.
- Rasio 9:16 untuk Reels; ekspor ulang 1:1 dengan teks digeser ke tengah untuk post feed.
- Jam tayang mengikuti jadwal yang sudah berjalan: **16.15 WIB** (`scripts/content/schedule.mjs`).
- Setelah tayang, cocokkan lonjakan kunjungan di GA4 — dan pastikan perangkat Anda sendiri sudah
  opt-out di `/analytics-optout`, kalau belum, angkanya akan menghitung Anda sendiri.

## Yang sengaja TIDAK ada di materi ini

Supaya tidak "diperbaiki" jadi lebih ramai di kemudian hari:

- Tidak ada testimoni, nama pelanggan, atau jumlah pengguna — pelanggan berbayar masih nol.
- Tidak ada angka penghematan waktu (termasuk 90%) dan tidak ada klaim kecepatan
  ("kurang dari 3 detik") — keduanya asumsi internal, belum pernah diukur.
- Tidak ada kalimat yang menyiratkan dokumen tetap berada di dalam perusahaan pelanggan — itu
  salah secara faktual; dokumen dikirim ke Gemini (indexing) dan Groq (jawaban), dan keterbukaan
  soal ini justru dipakai sebagai pembeda.
- Tidak ada "dijamin" atau "100% aman". Yang boleh diklaim kuat hanya pemisahan data antar
  perusahaan di level database (Postgres RLS, sudah diuji) dan sitasi di setiap jawaban.
