# Paket akhir pekan — Jumat–Minggu, 14–16 Agustus 2026

Menambah **Facebook + Threads + skrip video Gemini 10 detik** untuk tiga hari yang
sudah punya LinkedIn/YouTube Shorts/Instagram di `2026-08-10.md` (bagian "Jumat",
"Sabtu", "Minggu" — kartu Instagram-nya juga sudah dirender dan live di
`public/social/2026-08-10/05-jumat.png`, `06-sabtu.png`, `07-minggu.png`). Bagian
itu tidak diubah di sini.

**Revisi dari draf pertama:** tiga hari ini sekarang punya tiga sudut pandang
yang sengaja berbeda, bukan variasi dari cerita "upload dokumen, tanya AI" yang
sama tiga kali:

| Hari | Sudut pandang | Audiens |
|---|---|---|
| Jumat | **Akun Individu** — knowledge base pribadi, bukan produk tim yang dipaksakan | Satu orang, keputusan personal |
| Sabtu | **Integrasi Slack** — nilai tambah baru, jawaban muncul di tempat kerja tim sehari-hari | Akun Perusahaan berbayar |
| Minggu | **Akun Perusahaan** — closing yang membedakan dari Individu: satu knowledge base dipakai bersama, admin atur akses | Tim/perusahaan |

Fakta Akun Individu dan Slack sebelumnya **tidak ada** di `brand-facts.mjs` —
pipeline dibangun 2026-08-04, akun Individu baru live 2026-08-11 dan Slack
2026-08-13, jadi generator otomatis (LinkedIn/YouTube/Instagram mingguan) juga
belum pernah "tahu" keduanya. Sudah ditambahkan ke `brand-facts.mjs` (harga
Personal ke `lint.mjs` juga) supaya minggu-minggu berikutnya bisa mengangkatnya
juga, bukan cuma paket akhir pekan ini.

Ditulis manual, dicek dengan `node scripts/content/lint.mjs` — bersih.

---

# Jumat, 14 Agustus — Akun Individu: bukan cuma buat tim

*(LinkedIn/YouTube Shorts/Instagram hari ini di `2026-08-10.md` masih bahas
Akun Perusahaan — Starter tanpa risiko anggaran. Facebook/Threads/Gemini di
bawah ini sengaja ambil sudut berbeda: audiens individu.)*

## Facebook

```
Nggak semua orang yang mau rapi butuh persetujuan atasan dulu.

Selama ini IntelliBase kelihatan seperti alat khusus perusahaan — tapi ada
jalur terpisah untuk Anda sendiri: Akun Individu. Bukan akun perusahaan yang
kebetulan dipakai sendirian, tapi memang didesain dari awal pendaftaran untuk
satu orang — folder pribadi, dokumen sendiri, tanpa perlu mengelola siapa pun.

Mulai gratis dulu untuk coba pencarian dokumennya. Kalau butuh jawaban AI
tanpa batas bulanan (dibatasi 60 pertanyaan per hari), paket Personal-nya
Rp59.000/bulan — harga promo peluncuran, berlaku sampai 31 Desember 2026.

Kumpulkan catatan kerja, panduan, atau dokumen pribadi Anda di satu tempat,
lalu tanya langsung ke situ 👉 https://www.intellibaseai.com

Dokumen atau catatan pribadi apa yang paling sering Anda cari-cari sendiri?

#ProduktivitasPribadi #KnowledgeBase
```

**Komentar pertama:**
```
Akun Individu-nya terpisah dari Akun Perusahaan sejak pendaftaran — jadi tidak
perlu mendaftar "sebagai perusahaan" untuk pakai sendirian:
https://www.intellibaseai.com
```

## Threads

```
Selama ini orang kira IntelliBase cuma buat tim HR/Ops.

Ternyata ada jalur Akun Individu sendiri — buat satu orang, bukan tim. Folder
pribadi, dokumen sendiri, nggak perlu ngurus karyawan siapa pun.

Mulai gratis, upgrade Rp59rb/bulan kalau mau jawaban AI tanpa batas bulanan.

intellibaseai.com

Catatan kerja pribadi kalian sekarang nyimpennya di mana — notes app, Drive,
atau nggak kemana-mana?
```

## Skrip video Gemini — 10 detik

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter, terasa personal — bukan korporat.

ADEGAN: Meja kerja rumah/apartemen yang tenang di Indonesia. Satu orang usia
25-40 tahun duduk sendirian, menyusun rapi setumpuk catatan tulisan tangan dan
cetakan dokumen pribadi (isi tidak terbaca, blur) ke dalam satu folder, lalu
menutup folder itu dengan puas.

KAMERA: satu shot tanpa potongan, medium shot statis dengan sedikit dolly-in
di akhir.
PENCAHAYAAN: sore hari, hangat, cahaya lampu meja, suasana personal dan
tenang.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun,
tanpa tulisan yang benar-benar terbaca, tanpa karakter yang berbicara
menghadap kamera, tanpa suasana kantor/tim.
```

**Teks di layar:** "BUKAN BUAT TIM. BUAT ANDA SENDIRI."

---

# Sabtu, 15 Agustus — Sekarang bisa nanya langsung dari Slack

*(LinkedIn/YouTube Shorts/Instagram hari ini di `2026-08-10.md` bahas SOP resmi
yang kalah populer dari file di grup chat. Facebook/Threads/Gemini di bawah ini
menutup cerita itu dari sisi lain: integrasi Slack, bukan cuma "upload
dokumennya".)*

## Facebook

```
Kemarin kita bahas: SOP resmi sering kalah dipercaya dibanding file revisi
yang beredar di grup chat.

Sekarang tutup celah itu dari sisi lain — hubungkan IntelliBase ke Slack tim
Anda. Admin tinggal klik "Tambahkan ke Slack" sekali dari dashboard, lalu
karyawan yang emailnya terdaftar di IntelliBase bisa tanya dengan command
/tanya atau langsung mention bot-nya di channel. Jawabannya muncul di thread
yang sama, lengkap dengan nama dokumen sumbernya — tidak perlu pindah
aplikasi dulu.

Ini fitur di paket Professional dan Enterprise, bukan biaya tambahan terpisah.

Coba hubungkan workspace Slack tim Anda 👉 https://www.intellibaseai.com

Berapa kali seminggu tim Anda menanyakan sesuatu yang jawabannya sebenarnya
sudah ada di dokumen, tapi ditanyakan lewat chat ke orang lagi?

#SlackIntegration #HRIndonesia #OperasionalKantor
```

**Komentar pertama:**
```
Slack hanya bisa dihubungkan dari Akun Perusahaan yang sudah berlangganan
paket berbayar — cek paketnya di https://www.intellibaseai.com
```

## Threads

```
Kemarin: SOP resmi kalah saing sama file di grup chat.

Solusinya bukan cuma "rapiin dokumennya" — tapi jawab pertanyaannya di tempat
yang sama tim sudah biasa buka: Slack.

Admin connect sekali, abis itu karyawan tinggal /tanya atau mention bot-nya
di channel. Jawaban + nama dokumen sumber, langsung di thread yang sama.

intellibaseai.com
```

## Skrip video Gemini — 10 detik

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Kantor modern Indonesia. Seorang karyawan usia 25-35 tahun mengetik
cepat di ponsel sambil berjalan menuju mejanya, berhenti sejenak melihat
notifikasi balasan masuk (layar ponsel buram/backlit, tidak terbaca),
tersenyum tipis, lalu duduk tanpa perlu mendatangi meja rekan kerja lain.

KAMERA: satu shot tanpa potongan, tracking shot mengikuti dari samping,
berhenti saat ia duduk.
PENCAHAYAAN: siang hari, kantor terang, natural.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun
(termasuk logo Slack), tanpa tampilan layar ponsel yang terbaca, tanpa
karakter yang berbicara menghadap kamera.
```

**Teks di layar:** "TANYA DI SLACK. JAWABANNYA DI SLACK JUGA."

---

# Minggu, 16 Agustus — Akun Perusahaan: satu knowledge base, dipakai bersama

*(LinkedIn/YouTube Shorts/Instagram hari ini di `2026-08-10.md` bahas tantangan
teknis XLSX/PPTX — masih relevan, tidak diubah. Facebook/Threads di bawah ini
sengaja jadi penutup akhir pekan: kontraskan Akun Individu (Jumat) dan Slack
untuk tim (Sabtu) dengan menjelaskan Akun Perusahaan itu sendiri.)*

## Facebook

```
Dua hari terakhir kita bahas dua hal yang kelihatan mirip tapi tujuannya
beda: Akun Individu (Jumat) dan integrasi Slack untuk tim (kemarin).

Hari ini soal Akun Perusahaan itu sendiri — kenapa memang didesain beda dari
Akun Individu, bukan cuma soal harga. Di Akun Perusahaan, satu knowledge base
dipakai bersama: admin yang mengatur siapa jadi anggota, dokumen yang
diunggah bisa dibaca dan ditanyakan oleh karyawan yang diberi akses, dan
riwayat pertanyaannya bisa dipantau tim.

Kalau kebutuhan Anda cuma untuk diri sendiri, Akun Individu sudah cukup.
Begitu ada lebih dari satu orang yang perlu akses ke dokumen yang sama, itu
tandanya waktunya Akun Perusahaan.

Paket Starter-nya gratis untuk mulai — 5 pengguna, 10 dokumen, 100 pertanyaan
per bulan 👉 https://www.intellibaseai.com

Dokumen kerja tim Anda sekarang dibagikan lewat cara apa — Drive bersama,
grup chat, atau belum ada satu tempat resmi?

#ManajemenOperasional #SaaSIndonesia
```

**Komentar pertama:**
```
Kalau baru mau coba untuk tim, mulai dari paket Starter yang gratis:
https://www.intellibaseai.com
```

## Threads

```
2 hari terakhir kita bahas Akun Individu (buat sendiri) dan integrasi Slack
(buat tim).

Hari ini closing-nya: kenapa Akun Perusahaan itu beda desain, bukan cuma beda
harga. Satu knowledge base, dipakai bareng-bareng, admin yang atur aksesnya.

Cuma buat diri sendiri → Akun Individu.
Lebih dari 1 orang perlu akses dokumen yang sama → Akun Perusahaan.

intellibaseai.com
```

## Skrip video Gemini — 10 detik

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Ruang rapat kecil kantor modern Indonesia. Tiga karyawan usia 25-45
tahun duduk mengelilingi satu meja; salah satunya (tampak sebagai admin/lead)
membalik laptop ke arah dua rekan lainnya sambil menunjuk layar (layar tidak
terbaca), ketiganya mengangguk bersamaan.

KAMERA: satu shot tanpa potongan, gerak melingkar pelan (arc shot)
mengelilingi meja.
PENCAHAYAAN: siang hari, kantor terang, natural.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun,
tanpa tampilan layar laptop yang terbaca, tanpa karakter yang berbicara
menghadap kamera.
```

**Teks di layar:** "SATU KNOWLEDGE BASE. SELURUH TIM."

---

## Checklist upload

- **Facebook:** unggah video native (jangan tautan YouTube), subtitle
  di-burn-in, tautan tetap ditulis di caption bukan cuma komentar, teks layar
  6 detik terakhir wajib memuat alamat situs. Detail lengkap di
  `2026-08-08-facebook-video.md`.
- **Threads:** tanpa hashtag beruntun, boleh dipecah jadi reply thread kalau
  ingin menambah satu baris CTA terpisah alih-alih menumpuk di post utama.
- **Video Gemini:** teks di layar sengaja tidak diminta ke Gemini (hasilnya
  sering berantakan) — tambahkan manual di CapCut/editor setelah render. Klip
  Sabtu sengaja melarang logo Slack ikut ter-render — jangan ditambahkan
  manual juga, itu aset bermerek pihak lain.
- Jam tayang mengikuti jadwal yang sudah berjalan: **16.15 WIB**
  (`scripts/content/schedule.mjs`).

## Yang sengaja TIDAK ada di materi ini

- Tidak ada testimoni, nama pelanggan, atau jumlah pengguna — pelanggan
  berbayar masih nol.
- Tidak ada angka penghematan waktu (termasuk 90%) dan tidak ada klaim
  kecepatan — keduanya asumsi internal, belum pernah diukur.
- Tidak ada kalimat yang menyiratkan dokumen tetap di dalam perusahaan
  pelanggan — dokumen dikirim ke Gemini (indexing) dan Groq (jawaban).
- Tidak ada "dijamin" atau "100% aman".
- Tidak ada klaim bahwa Slack tersedia untuk Akun Individu, atau bahwa Akun
  Individu punya fitur tim — keduanya salah secara produk (lihat
  `src/lib/slack-answer.ts`: "Slack is company-only").
