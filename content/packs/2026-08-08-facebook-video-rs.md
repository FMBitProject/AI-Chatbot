# Paket Video Facebook — Vertikal Rumah Sakit & Klinik (8 Agustus 2026)

Versi RS dari `2026-08-08-facebook-video.md`. Tujuannya sama — **mengundang orang membuka
website** — tapi tujuannya bukan halaman depan.

**Tautan yang dipakai di paket ini adalah `/solusi/rumah-sakit`, bukan halaman depan.**
Halaman depan sengaja netral industri; orang RS yang mendarat di sana harus mencari sendiri
bagian yang relevan. Halaman vertikal langsung menyambut dengan kosakata mereka (clinical
pathway, SPO, PPK, formularium), sudah memuat blok isolasi data, disclaimer "bukan alat
keputusan klinis", dan blok siapa di balik produk — jadi video tidak perlu memikul semuanya
sendiri. Tombol "Mulai Gratis" tetap ada di halaman itu.

Isi: Video A (hybrid b-roll + rekaman layar, utama) · Video B (b-roll Gemini penuh) ·
caption masing-masing · komentar pertama · varian hook · checklist upload.

> Ditulis manual, dicek dengan `node scripts/content/lint.mjs` — bersih.

## Tiga pagar khusus vertikal ini (tidak ada di `lint.mjs`, harus dijaga manual)

1. **Alat pencarian dokumen internal, bukan alat pengambilan keputusan klinis.** Wajib muncul
   di setiap caption dan di teks layar penutup video.
2. **Dokumen kebijakan & prosedur, bukan rekam medis pasien.** Wajib disebut di caption.
3. **Prompt video RS melarang pasien, ranjang pasien, dan tindakan medis di frame.** Sudah
   tertulis di blok JANGAN tiap prompt di bawah — jangan dihapus saat mengedit prompt.

Ditambah satu pagar produksi: **jangan pernah merekam dokumen rumah sakit yang asli.** Buat
satu SPO contoh sendiri untuk keperluan rekaman (lihat catatan di Video A).

---

## VIDEO A — Hybrid: klip pembuka + rekaman layar (utama)

**Durasi:** ±45 detik · **Rasio:** 9:16 (Reels), ekspor ulang 1:1 untuk feed
**Bahan:** 1 klip Gemini 6 detik (prompt di bawah) + rekaman layar akun demo IntelliBase.

**Dokumen untuk rekaman — baca sebelum merekam:** buat sendiri satu berkas contoh, misalnya
"SPO Pemasangan Kateter Urin — RS Contoh Sejahtera, Revisi 03". Isi boleh ringkas, yang penting
strukturnya realistis (nomor revisi, tanggal berlaku, unit pemilik). **Jangan memakai clinical
pathway, SPO, atau PPK milik rumah sakit mana pun yang nyata**, sekalipun Anda punya aksesnya —
begitu tayang di Facebook, dokumen internal milik institusi lain ada di ruang publik dan tidak
bisa ditarik. Nama rumah sakit di layar harus jelas fiktif.

### Skrip (voiceover + aksi layar)

| Waktu | Aksi di layar | Voiceover (Bahasa Indonesia) | Teks di layar |
|---|---|---|---|
| 0–6 dtk | **Klip Gemini**: nurse station dini hari, perawat membuka binder tebal | "Jam tiga pagi, seorang perawat perlu memastikan satu langkah di SPO. Bagian mutu sudah pulang." | JAM 3 PAGI. SPO REVISI MANA? |
| 6–13 dtk | Halaman upload IntelliBase; masukkan "SPO Pemasangan Kateter Urin Rev-03.pdf" + 2 berkas lain | "Unggah dokumen resmi rumah sakit Anda sendiri — clinical pathway, SPO, PPK, formularium." | UNGGAH DOKUMEN RESMI RS ANDA |
| 13–22 dtk | Ketik di kolom chat: *"Bagaimana SPO pemasangan kateter urin?"* → jawaban mengalir | "Staf bertanya seperti bertanya ke senior, bukan dengan kata kunci." | TANYA SEPERTI KE SENIOR |
| 22–33 dtk | **Sorot sitasi di bawah jawaban, lalu klik** → dokumen sumber terbuka di halaman yang dirujuk, nomor revisi terlihat | "Setiap jawaban membawa sitasi ke dokumen sumbernya, sampai ke halaman aslinya. Jadi tidak ada yang perlu menebak jawaban itu datang dari revisi yang mana." | ADA SITASINYA. BUKA HALAMAN ASLINYA. |
| 33–39 dtk | Gulir halaman `/solusi/rumah-sakit` ke blok isolasi data | "Data tiap rumah sakit terisolasi di level database. Dokumen diindeks lewat Google Gemini dan dijawab dengan Groq — itu kami sampaikan terbuka." | TERBUKA SOAL KE MANA DOKUMEN ANDA PERGI |
| 39–45 dtk | Blok disclaimer di halaman yang sama, lalu beku dengan URL besar | "Ini alat pencarian dokumen internal, bukan alat pengambilan keputusan klinis. Coba dengan satu clinical pathway Anda, gratis, di intellibaseai.com." | **BUKAN ALAT KEPUTUSAN KLINIS**<br>intellibaseai.com/solusi/rumah-sakit |

**Catatan pengambilan:**
- Detik 22–33 adalah inti video. Yang membuat orang mutu dan komite medik penasaran bukan
  "AI-nya pintar", tapi bahwa jawabannya bisa dilacak sampai halaman dan nomor revisi.
- Nomor revisi di dokumen contoh sebaiknya terlihat jelas saat sitasi diklik — itu yang
  menjawab keberatan pertama audiens ini tanpa perlu satu kalimat pun.
- Detik 39–45 jangan dipotong walau durasi mepet. Disclaimer yang muncul di layar, bukan hanya
  di caption, adalah yang membedakan post ini dari iklan AI kesehatan yang bikin orang RS curiga.
- Sebagian besar orang menonton tanpa suara: kalau tidak merekam voiceover, jadikan seluruh
  baris voiceover sebagai teks di layar dan tambahkan musik instrumental tipis.

### PROMPT KLIP PEMBUKA — 6 detik (paste ke Gemini)

```
Buat video realistis berdurasi 6 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Nurse station di rumah sakit Indonesia pada dini hari, koridor di belakangnya sepi
dan temaram. Seorang perawat perempuan usia 25-35 tahun berseragam scrub polos membuka
binder tebal di bawah cahaya lampu meja, membalik halaman dengan ragu. Kursi lain kosong.

KAMERA: satu shot tanpa potongan, dolly-in perlahan dari koridor menuju medium close-up
tangan yang membalik halaman binder.
PENCAHAYAAN: lampu koridor redup kehijauan, lampu meja hangat sebagai sumber utama,
kontras kuat, suasana tenang.
AUDIO: tanpa narasi, hanya ambience ruangan yang sangat tenang.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di binder maupun layar, tanpa pasien atau ranjang pasien di frame, tanpa tindakan
medis apa pun, tanpa darah atau alat medis invasif, tanpa karakter yang berbicara menghadap
kamera.
```

### Caption Facebook — Video A

```
Jam tiga pagi, perawat Anda perlu memastikan satu langkah di SPO. Bagian mutu sudah pulang,
supervisor sedang menangani pasien lain, dan binder di nurse station entah revisi tahun berapa.

Yang terjadi berikutnya bisa ditebak: bertanya ke rekan yang kebetulan lebih senior, atau
mengandalkan ingatan. Bukan karena stafnya lalai — pelayanan berjalan 24 jam, sementara
penanggung jawab dokumen tidak.

Satu perbaikan yang bisa dikerjakan minggu ini tanpa alat apa pun: pastikan setiap halaman
dokumen memuat nomor revisi, tanggal berlaku, dan unit pemilik. Lalu tarik fotokopi lama dari
dinding ruangan. Sebagian besar keraguan shift malam lahir dari dua versi yang sama-sama
terlihat resmi.

Kalau ingin staf bisa mencarinya sendiri, itu yang kami kerjakan di IntelliBase: clinical
pathway, SPO, PPK, formularium, dan panduan akreditasi yang rumah sakit Anda unggah sendiri
bisa ditanyai dengan bahasa biasa. Setiap jawaban membawa sitasi ke dokumen sumbernya — bisa
dibuka sampai halaman aslinya, jadi bagian mutu tidak perlu menebak jawaban itu datang dari
revisi yang mana.

Dua hal yang kami sampaikan di depan, bukan di halaman syarat:
• Ini alat pencarian dokumen internal, bukan alat pengambilan keputusan klinis. Untuk dokumen
  kebijakan dan prosedur — bukan rekam medis pasien.
• Dokumen dikirim ke Google Gemini untuk diindeks dan ke Groq untuk menjawab. Data antar
  rumah sakit dipisah di level database.

IntelliBase dibangun oleh seorang dokter yang belajar membuat perangkat lunak. Selengkapnya,
dan coba sendiri dengan satu clinical pathway Anda:
👉 https://www.intellibaseai.com/solusi/rumah-sakit

Paket Starter gratis selamanya — 5 pengguna, 10 dokumen, tanpa kartu kredit.

Di rumah sakit Anda, ke mana staf shift malam bertanya saat ragu soal prosedur?

#RumahSakit #MutuRS #Akreditasi
```

### Komentar pertama (tempel begitu post terbit)

```
Halaman khusus rumah sakit & klinik: https://www.intellibaseai.com/solusi/rumah-sakit
Di sana ada daftar jenis dokumen yang bisa diunggah, contoh pertanyaan yang sering muncul
di lapangan, dan penjelasan soal isolasi data antar rumah sakit.
Cara mencoba paling cepat: unggah satu SPO, ajukan lima pertanyaan, lalu nilai sendiri
jawabannya — termasuk sitasinya.
```

---

## VIDEO B — B-roll Gemini penuh (variasi, tanpa rekam layar)

**Durasi:** ±28 detik · **Rasio:** 9:16 · 3 klip @ ±9 detik, disambung di CapCut.
Teks di layar ditambahkan sendiri (model video masih sering menulis huruf berantakan).
Voiceover direkam terpisah lalu ditimpa di atas klip.

### Voiceover penuh (baca ±28 detik, ±75 kata)

> "Pertanyaan prosedur di rumah sakit tidak menunggu jam kerja. Shift malam, staf orientasi,
> unit yang baru rotasi — semuanya butuh jawaban saat bagian mutu tidak bisa dihubungi.
> Kami membuat IntelliBase supaya clinical pathway dan SPO rumah sakit Anda bisa ditanyai
> langsung, dengan sitasi ke dokumen sumbernya. Alat pencarian dokumen internal, bukan alat
> pengambilan keputusan klinis. Coba di intellibaseai.com."

### PROMPT VIDEO 1 — 0–9 detik (paste ke Gemini)

```
Buat video realistis berdurasi 9 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Koridor rumah sakit Indonesia pada dini hari, sepi dan temaram, hanya lampu koridor
yang menyala. Di ujung koridor terlihat nurse station kosong dengan satu lampu meja menyala.
Suasana sunyi dan tenang.

KAMERA: satu shot tanpa potongan, dolly maju perlahan menyusuri koridor menuju nurse station.
PENCAHAYAAN: dini hari, lampu redup kehijauan, satu sumber cahaya hangat di nurse station.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di mana pun, tanpa pasien atau ranjang pasien di frame, tanpa tindakan medis apa pun,
tanpa darah atau alat medis invasif, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar:** PERTANYAAN PROSEDUR TIDAK MENUNGGU JAM KERJA

### PROMPT VIDEO 2 — 9–18 detik (paste ke Gemini)

```
Buat video realistis berdurasi 9 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Ruang administrasi rumah sakit Indonesia yang bersih dan terang, siang hari. Rak arsip
berisi map dan binder tebal berjajar rapi. Seorang staf usia 28-40 tahun berseragam rapi polos
menyusuri rak, menarik satu binder, lalu membalik halaman sambil berdiri.

KAMERA: satu shot tanpa potongan, tracking mengikuti staf dari samping, berakhir pada tangan
yang membalik halaman.
PENCAHAYAAN: siang hari, cahaya natural dari jendela samping, bersih, kontras lembut.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di binder maupun map, tanpa pasien atau ranjang pasien di frame, tanpa tindakan medis
apa pun, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar:** CLINICAL PATHWAY · SPO · PPK · FORMULARIUM

### PROMPT VIDEO 3 — 18–28 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Ruang diskusi kecil di rumah sakit Indonesia, terang dan bersih. Dua staf usia 30-45
tahun berseragam rapi polos berdiri berdampingan menatap satu laptop di atas meja tinggi,
salah satunya mengangguk pelan lalu tersenyum tipis. Suasana tenang, bukan euforia.

KAMERA: satu shot tanpa potongan, gerak lateral pelan dari kanan ke kiri berakhir pada kedua
wajah.
PENCAHAYAAN: sore hari, cahaya hangat dari jendela besar di belakang.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tampilan layar
laptop yang terbaca, tanpa pasien atau ranjang pasien di frame, tanpa tindakan medis apa pun,
tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar:** intellibaseai.com/solusi/rumah-sakit — COBA GRATIS

### Caption Facebook — Video B

```
Rumah sakit bukan kantor biasa dengan istilah yang lebih rumit.

Tiga hal membuat dokumennya berperilaku berbeda. Pelayanan berjalan 24 jam, jadi pertanyaan
prosedur muncul di jam yang tidak ada penanggung jawab dokumen. Clinical pathway, SPO, PPK,
formularium, dan panduan akreditasi punya siklus revisinya masing-masing dan sering berlapis.
Dan stafnya terus berganti — perawat orientasi, dokter internsip, staf yang pindah unit —
sehingga pertanyaan yang sama diulang ke orang yang sama sepanjang tahun.

Uji sederhana yang bisa Anda lakukan pada sistem apa pun, termasuk milik kami: ambil satu
dokumen yang baru saja direvisi, masukkan versi barunya, lalu ajukan pertanyaan yang jawabannya
berubah antara revisi lama dan baru. Periksa dua hal — apakah jawabannya mengikuti versi
terbaru, dan apakah ia menunjukkan dokumen serta halaman asalnya. Kalau tidak menunjukkan
sumber, bagian mutu tetap harus memverifikasi manual dan tidak ada yang benar-benar berubah.

Di IntelliBase, setiap jawaban membawa sitasi ke dokumen yang rumah sakit Anda unggah sendiri.
Data antar rumah sakit dipisah di level database. Dokumen diindeks lewat Google Gemini dan
dijawab dengan Groq — kami sebutkan terbuka, karena ini pertanyaan pertama yang pantas
diajukan komite medik.

Ini alat pencarian dokumen internal untuk kebijakan dan prosedur, bukan alat pengambilan
keputusan klinis, dan bukan untuk rekam medis pasien. Keputusan medis tetap sepenuhnya di
tangan tenaga kesehatan.

Halaman lengkapnya, termasuk daftar dokumen yang bisa diunggah:
👉 https://www.intellibaseai.com/solusi/rumah-sakit

Dokumen apa yang paling sering dicari staf di rumah sakit Anda?

#RumahSakit #KlinikIndonesia #MutuRS
```

---

## Varian hook (3 detik pertama) untuk diuji

Ganti hanya baris pertama caption + teks layar pertama, sisanya tetap:

1. **Fotokopi di dinding** — "Revisi terbaru sering kalah cepat dari fotokopi lama yang menempel di dinding ruangan."
2. **Staf orientasi** — "Setiap gelombang perawat orientasi menanyakan prosedur yang sama, ke orang yang sama."
3. **Menjelang survei** — "Menjelang survei akreditasi, yang paling sibuk bukan stafnya — tapi orang yang hafal semua letak dokumennya."

Hook 3 paling tajam kalau ditayangkan mendekati musim survei; hook 1 paling aman kapan saja.

---

## Checklist upload Facebook

- **Unggah video langsung ke Facebook** (native), jangan tempel tautan YouTube — tautan YouTube
  akan menggantikan pratinjau tautan situs Anda.
- **Subtitle dibakar ke video** (burn-in). Ruang perawat dan ruang mutu bukan tempat orang
  menyalakan suara; tanpa subtitle, hook detik pertama hilang.
- **Tautan tetap ditulis di caption**, bukan hanya di komentar pertama. Komentar pertama itu
  penguat, bukan pengganti.
- **Tulis alamatnya sebagai teks biasa juga** ("intellibaseai.com/solusi/rumah-sakit") supaya
  tetap terbaca kalau pratinjau tautan gagal muncul.
- **Teks layar 6 detik terakhir wajib memuat alamat situs + kalimat "bukan alat keputusan
  klinis"** — banyak yang menonton sampai habis tanpa pernah membaca caption.
- Rasio 9:16 untuk Reels; ekspor ulang 1:1 dengan teks digeser ke tengah untuk post feed.
- Jam tayang mengikuti jadwal yang berjalan: **16.15 WIB** (`scripts/content/schedule.mjs`).
- Kalau ada yang berkomentar menanyakan integrasi SIMRS atau rekam medis: jawab jujur di kolom
  komentar bahwa platform ini untuk dokumen kebijakan dan prosedur, dan perlakukan penanyanya
  sebagai calon wawancara pelanggan, bukan calon closing.

## Yang sengaja TIDAK ada di materi ini

- Tidak ada nama rumah sakit, testimoni, atau jumlah pengguna — pelanggan berbayar masih nol.
  Berlaku juga untuk dokumen di rekaman layar: semuanya contoh buatan sendiri.
- Tidak ada klaim soal status akreditasi, kepatuhan regulasi, atau hasil survei. Produk ini
  membantu staf menemukan dokumennya; ia tidak membuat rumah sakit lulus apa pun.
- Tidak ada angka penghematan waktu dan tidak ada klaim kecepatan — keduanya asumsi internal
  yang belum pernah diukur. Halaman `/solusi/rumah-sakit` memakai frasa "hitungan detik" di
  judulnya; frasa itu sengaja tidak dibawa ke video maupun caption.
- Tidak ada kalimat yang menyiratkan dokumen tetap berada di dalam rumah sakit — dokumen
  dikirim ke Gemini (indexing) dan Groq (jawaban), dan keterbukaan soal itu justru dipakai
  sebagai pembeda.
- Soal pendiri: hanya profesinya yang disebut ("seorang dokter"). Tanpa spesialisasi, tanpa
  nama institusi, tanpa lama praktik, tanpa nomor STR.
