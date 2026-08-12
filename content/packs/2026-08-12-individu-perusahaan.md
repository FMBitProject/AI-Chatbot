# Paket Individu + Perusahaan (12 Agustus 2026)

Sudut pandang baru, ditulis tangan — bukan hasil `npm run content:generate`.

**Novelty-nya:** semua paket sebelumnya bicara ke HRD/IT perusahaan. Paket ini yang pertama
memakai tier **Individu** (sudah live di main, commit `9cff14c`), dan menyatukan dua audiens
lewat satu gagasan: *ukuran organisasi tidak mengubah bentuk masalahnya.*

**Hook yang sudah terpakai dan JANGAN diulang:** SOP menumpuk di Drive, grup WhatsApp unit,
jam 3 pagi, fotokopi lama di dinding, satu orang hafal semua dokumen lalu cuti, staf orientasi
bertanya berulang, menjelang survei akreditasi, "ke mana dokumen AI Anda dikirim".

## Pagar yang berlaku untuk paket ini

1. **Tanpa harga.** [pricing.ts:34-38](../../src/lib/pricing.ts) menyatakan sendiri angka
   Personal belum diriset ("It is NOT a researched number"). Mengumumkan angkanya di media
   sosial membuatnya mahal diubah. Cukup "paket gratis untuk mulai".
2. **Tanpa klaim BYOK** — lihat bagian terakhir file ini.
3. Gemini & Groq disebut terbuka di format yang panjang, sesuai `brand-facts.mjs`.
4. Suara kolektif ("kami"), bukan orang pertama tunggal. Ini akun halaman perusahaan.

---

## LINKEDIN

```
Anda ingat pernah membaca jawabannya. Anda tidak ingat ada di berkas yang mana.

Satu hal yang kami perhatikan saat membangun IntelliBase: masalah ini tidak berubah bentuk
mengikuti ukuran organisasi. Seorang konsultan dengan 40 dokumen acuan dan tim 40 orang dengan
ratusan SOP mengalami kegagalan yang sama persis — bukan gagal menyimpan, tapi gagal menemukan
kembali satu paragraf yang sudah pernah dibaca.

Karena itu IntelliBase punya dua pintu masuk sekarang.

Individu: folder pribadi, dan dokumen yang hanya bisa dibuka pemiliknya sendiri.
Perusahaan: akses per departemen, dengan isolasi data antar perusahaan di level database
(Postgres Row Level Security, sudah kami uji).

Cara kerjanya sama di keduanya. Anda bertanya dengan bahasa biasa; jawabannya membawa sitasi
ke dokumen sumbernya, jadi bisa Anda periksa sendiri. Dokumen diindeks lewat Google Gemini dan
dijawab oleh Groq — kami sebutkan terbuka, karena Anda berhak tahu ke mana berkas Anda pergi
sebelum memutuskan memakainya.

Dokumen yang paling sering Anda cari ulang itu dokumen kantor, atau dokumen Anda sendiri?

#ManajemenDokumen #ProduktivitasKerja
```

---

## FACEBOOK

```
"Aturannya sudah pernah dibaca kok. Tapi ada di berkas yang mana?"

Kalimat itu terdengar sama, entah keluar dari satu orang yang mengurus dokumennya sendiri atau
dari tim berisi lima puluh orang. Menyimpan berkas itu mudah — yang sulit adalah menemukan
kembali satu paragraf yang sudah pernah Anda baca enam bulan lalu.

IntelliBase membuat dokumen yang Anda unggah sendiri bisa ditanyai dengan bahasa biasa, dan
setiap jawaban membawa sitasi ke dokumen sumbernya.

Ada dua pintu masuk:
• Individu — folder pribadi, dokumen hanya bisa dibuka oleh Anda
• Perusahaan — akses per departemen, data tiap perusahaan terisolasi di level database

Terbuka soal cara kerjanya: dokumen Anda diindeks lewat Google Gemini dan dijawab oleh Groq.
Kami lebih memilih Anda tahu itu sejak awal.

Mulai dari paket gratis 👉 https://www.intellibaseai.com

#ManajemenDokumen
```

---

## INSTAGRAM

**Perlu dibuat:** kartu teks latar teal. Baris besar di tengah: *"Ingat pernah membacanya.
Lupa ada di file mana."* Baris kecil di bawah: *"Untuk satu orang, dan untuk satu tim."*

```
Ingat pernah membacanya. Lupa ada di berkas yang mana.

Masalah itu tidak mengecil kalau dokumen Anda cuma 40, dan tidak berubah bentuk kalau
dokumen tim Anda ada 400.

IntelliBase membuat dokumen yang Anda unggah bisa ditanyai dengan bahasa biasa — jawabannya
membawa sitasi ke dokumen sumbernya, jadi bisa Anda periksa sendiri.

Dua pintu masuk: Individu untuk folder pribadi Anda, Perusahaan untuk akses per departemen.

Dokumen Anda diindeks lewat Google Gemini dan dijawab oleh Groq. Kami sebut terbuka.

Mulai gratis — tautan di bio.

#ManajemenDokumen #Produktivitas
```

---

## YOUTUBE SHORTS

**Judul:** Dokumen Anda Menumpuk, Bukan Hilang — Itu Dua Masalah Berbeda

**Perlu direkam:** layar dengan daftar berkas panjang, lalu beralih ke jendela chat IntelliBase
saat pertanyaan diketik, lalu sorot bagian sitasi di bawah jawaban.

**Skrip (±50 detik):**

```
Coba jawab satu pertanyaan: aturan cuti di tempat Anda, ada di berkas yang mana?

Kebanyakan orang tahu aturannya ada. Yang tidak mereka tahu adalah di halaman berapa,
di dokumen versi keberapa.

Itu bukan masalah penyimpanan. Google Drive sudah menyimpannya dengan baik. Itu masalah
menemukan kembali — dan alat penyimpanan memang tidak dirancang untuk menjawab pertanyaan.

IntelliBase kami bangun untuk bagian itu saja. Anda unggah dokumen Anda sendiri, lalu Anda
bertanya dengan bahasa biasa. Jawabannya datang dengan sitasi ke dokumen sumbernya, jadi Anda
bisa membuka sendiri halaman aslinya dan memeriksa.

Ada dua pintu masuk. Individu, kalau dokumen itu milik Anda sendiri — folder pribadi, dan
hanya Anda yang bisa membukanya. Perusahaan, kalau dokumen itu milik tim — dengan akses per
departemen dan isolasi data antar perusahaan di level database.

Satu hal yang kami sebut terbuka: dokumen Anda diindeks lewat Google Gemini dan dijawab oleh
Groq. Kami tidak mengolah semuanya sendiri, dan menurut kami Anda berhak tahu itu sebelum
mengunggah apa pun.

Paket gratisnya bisa dicoba tanpa kartu kredit.
```

**Deskripsi:**

```
IntelliBase membuat dokumen yang Anda unggah bisa ditanyai dengan bahasa biasa, lengkap dengan
sitasi ke dokumen sumbernya. Tersedia untuk pemakaian pribadi maupun untuk tim.

Dokumen diindeks lewat Google Gemini dan dijawab oleh Groq.

Coba paket gratis: https://www.intellibaseai.com
```

---

## SKRIP ANIMASI 10 DETIK

Untuk IG Reels / YouTube Shorts / iklan pendek. Rasio 9:16. Tanpa narasi suara — dibaca
sambil senyap, jadi teks di layar harus berdiri sendiri. Musik: satu nada berulang, naik di
detik 7.

Palet: teal merek (bukan biru), latar putih bersih.

| Detik | Visual | Teks di layar |
|---|---|---|
| 0,0–2,0 | Satu ikon dokumen di tengah, lalu berlipat cepat jadi tumpukan puluhan yang memenuhi layar. Gerakannya berat, sedikit menumpuk berantakan. | **"Ingat pernah membacanya."** |
| 2,0–3,5 | Tumpukan membeku. Kursor mencari, menyorot berkas satu per satu, tidak menemukan. | **"Lupa ada di mana."** |
| 3,5–5,5 | Layar terbelah dua secara vertikal. Kiri: satu ikon orang, sedikit dokumen. Kanan: ikon tiga orang, banyak dokumen. Keduanya menampilkan animasi kebingungan yang identik. | Kiri: **"1 orang"** · Kanan: **"1 tim"** — lalu muncul di tengah: **"Masalah yang sama."** |
| 5,5–7,0 | Belahan menyatu. Sebuah kolom tanya muncul; teks mengetik sendiri: *"Berapa lama masa garansinya?"* | (teks yang diketik itu sendiri) |
| 7,0–9,0 | Jawaban muncul baris demi baris. Lalu kartu sitasi kecil menyelip masuk dari bawah dengan nama berkas + nomor halaman, disorot sesaat. | **"Jawabannya membawa sumbernya."** |
| 9,0–10,0 | Semua menyusut jadi logo IntelliBase. Dua tombol kecil muncul berdampingan. | **"Individu · Perusahaan"** + `intellibaseai.com` |

**Yang tidak boleh muncul di frame:** angka penghematan waktu, stopwatch atau apa pun yang
menyiratkan klaim kecepatan, wajah orang yang tampak sedang memberi endorsement, logo
perusahaan mana pun, dan tulisan "100%" atau "aman sepenuhnya".

**Catatan sitasi (detik 7–9):** ini frame terpenting di seluruh animasi. Sitasi adalah satu
pembeda yang benar-benar bisa kami buktikan, jadi jangan dipotong kalau durasinya terasa mepet
— potong bagian 0–2 detik saja.

---

## JANGAN DIPOSTING DULU: varian BYOK

PR #98 sudah ter-merge, tapi fitur ini **rusak di produksi kalau `BYOK_SECRET_KEY` belum
diisi di Vercel**. Verifikasi dulu dengan benar-benar menyimpan satu API key dari dashboard
di situs live. Setelah itu baru caption di bawah boleh dipakai.

```
Ada satu pertanyaan yang jarang berani ditanyakan ke vendor AI: dokumen Anda diproses memakai
akun siapa?

Di IntelliBase jawabannya boleh Anda tentukan sendiri. Mulai dari paket berbayar yang paling
kecil, Anda bisa memasang API key Google dan Groq milik Anda sendiri — sehingga dokumen Anda
diindeks dan dijawab di dalam akun penyedia Anda, bukan akun bersama milik kami.

Kami membukanya sampai ke paket perorangan dengan sengaja. Orang yang bekerja sendiri sering
justru memegang dokumen paling sensitif, dan menurut kami jawaban "akun Anda sendiri"
seharusnya tidak cuma bisa dibeli oleh perusahaan berkaryawan lima puluh.

Key yang Anda simpan kami enkripsi sebelum masuk database.

Kalau Anda mengevaluasi alat AI sekarang, pertanyaan soal akun pemroses ini sudah masuk daftar
Anda atau belum?

#KeamananData #AI
```
