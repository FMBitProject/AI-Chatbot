# Paket RS — Caption Pendek + Video Anime 10 Detik (10 Agustus 2026)

Tujuan paket ini **hanya satu: bikin orang berhenti scroll lalu mengklik tautan**. Bukan edukasi
panjang seperti `2026-08-07-rumahsakit.md` dan `2026-08-08-facebook-video-rs.md` — caption di sana
sengaja panjang (hook + value) supaya berguna walau tidak diklik. Di sini kebalikannya: 4–6 baris,
satu ketegangan, satu tautan.

**Tautan selalu `/solusi/rumah-sakit`, bukan halaman depan** — halaman depan netral industri,
orang RS harus mencari sendiri bagian yang relevan di sana.

**Empat hook di bawah semuanya baru** — tidak mengulang paket sebelumnya. Yang sudah terpakai dan
jangan diulang lagi: *jam 3 pagi*, *fotokopi lama di dinding*, *RS bukan kantor biasa*,
*staf orientasi bertanya berulang*, *menjelang survei akreditasi*.

> Dicek dengan `node scripts/content/lint.mjs content/packs/2026-08-10-rs-caption-pendek.md` — bersih.

## Pagar yang tetap berlaku (tidak dicek `lint.mjs`, jaga manual)

1. Alat **pencarian dokumen internal**, bukan alat pengambilan keputusan klinis.
2. Dokumen **kebijakan & prosedur**, bukan rekam medis pasien.
3. Prompt video RS melarang pasien, ranjang pasien, dan tindakan medis di frame — termasuk di
   versi anime di bawah.

Di caption pendek, ketiga hal itu diringkas jadi satu baris tetap:
*"Pencarian dokumen kebijakan & prosedur — bukan rekam medis, bukan alat keputusan klinis."*
Baris itu jangan dihapus demi memperpendek post.

---

## CAPTION 1 — Grup WhatsApp

```
Mesin pencari dokumen di rumah sakit Anda hari ini bernama: grup WhatsApp unit.

"Ada yang punya SPO terbaru?" — lalu 40 orang ikut membaca, satu orang menjawab, dan
jawabannya tenggelam dalam dua jam.

IntelliBase membuat clinical pathway, SPO, PPK, dan formularium yang Anda unggah sendiri bisa
ditanyai langsung, dengan sitasi ke dokumen sumbernya.

Pencarian dokumen kebijakan & prosedur — bukan rekam medis, bukan alat keputusan klinis.

Lihat cara kerjanya 👉 https://www.intellibaseai.com/solusi/rumah-sakit

#RumahSakit #MutuRS
```

## CAPTION 2 — Satu orang cuti

```
Ada satu orang di rumah sakit Anda yang hafal letak semua dokumen.

Apa yang terjadi pada hari dia cuti?

IntelliBase menaruh pengetahuan itu di tempat yang tidak bisa cuti: staf bertanya dengan bahasa
biasa, jawabannya membawa sitasi ke dokumen sumbernya.

Pencarian dokumen kebijakan & prosedur — bukan rekam medis, bukan alat keputusan klinis.

Coba gratis 👉 https://www.intellibaseai.com/solusi/rumah-sakit

#RumahSakit #Akreditasi
```

## CAPTION 3 — Dokumennya ada, cuma tidak ketemu

```
Dokumen itu ada. Sudah disahkan, sudah direvisi, sudah rapi.

Yang tidak ada: orang yang ingat dia disimpan di folder mana.

IntelliBase membuat dokumen resmi rumah sakit Anda bisa ditanyai seperti bertanya ke rekan
senior — dan tiap jawaban menunjukkan dokumen serta halaman asalnya.

Pencarian dokumen kebijakan & prosedur — bukan rekam medis, bukan alat keputusan klinis.

Buka halaman khusus RS 👉 https://www.intellibaseai.com/solusi/rumah-sakit

#RumahSakit #ManajemenDokumen
```

## CAPTION 4 — Rotasi berikutnya

```
Setiap rotasi baru, pertanyaan prosedur yang sama dimulai lagi dari nol.

Yang berganti stafnya. Dokumennya itu-itu juga.

IntelliBase membuat SPO, clinical pathway, PPK, dan panduan akreditasi rumah sakit Anda bisa
ditanyai kapan pun, lengkap dengan sitasi ke sumbernya. Starter gratis: 5 pengguna, 10 dokumen,
tanpa kartu kredit.

Pencarian dokumen kebijakan & prosedur — bukan rekam medis, bukan alat keputusan klinis.

Mulai di 👉 https://www.intellibaseai.com/solusi/rumah-sakit

#RumahSakit #KlinikIndonesia
```

**Catatan penempatan:** untuk LinkedIn, tambahkan satu pertanyaan sebelum tautan (mis. "Di tempat
Anda, ke mana pertanyaan prosedur bermuara?") — di sana komentar lebih berharga daripada klik.
Untuk Facebook dan Instagram, biarkan pendek seperti di atas.

---

# VIDEO 10 DETIK — vibes anime

Satu adegan, 9:16, tanpa dialog karakter. Voiceover 10 detik = **maksimal ±20 kata**.
Teks di layar **tidak** diminta ke model video (huruf sering berantakan) — tambahkan di
CapCut/Canva.

## Skrip per detik (versi utama — anime, gaya Ghibli/Shinkai)

| Waktu | Yang terlihat | Teks di layar (tambah manual) | Audio |
|---|---|---|---|
| 0–3 dtk | Koridor RS gaya anime, sore keemasan. Perawat muda berdiri di depan rak binder setinggi dada, memiringkan kepala, bingung. | SPO-NYA REVISI MANA? | Voiceover kalimat 1 · musik piano tipis |
| 3–7 dtk | Close-up: dia mengetik di tablet, layar bercahaya lembut memantul di wajahnya. Ekspresi berubah jadi lega. | TANYA PAKAI BAHASA BIASA | Voiceover kalimat 2 |
| 7–10 dtk | Kamera mundur, dia menutup binder dan berjalan pergi ringan; koridor hangat, debu cahaya. | intellibaseai.com/solusi/rumah-sakit<br>**BUKAN ALAT KEPUTUSAN KLINIS** | Musik naik tipis lalu berhenti |

**Voiceover lengkap (18 kata, pas untuk 10 detik):**

> "Dokumen rumah sakit Anda bisa ditanya seperti bertanya ke senior. Setiap jawaban membawa
> sitasi ke sumbernya."

### PROMPT VIDEO — anime (paste ke Gemini)

```
Buat video animasi 2D bergaya anime Jepang, durasi 10 detik, rasio 9:16 vertikal, gaya seperti
film anime modern: garis bersih, warna hangat, cahaya sinematik lembut, latar digambar detail.

ADEGAN: Koridor rumah sakit modern di Indonesia pada sore hari, cahaya keemasan masuk dari
jendela besar. Seorang perawat perempuan muda berseragam scrub polos berdiri di depan rak arsip
berisi binder tebal, memiringkan kepala dengan ekspresi bingung. Lalu ia menunduk ke tablet di
tangannya; wajahnya tersinari cahaya layar dan ekspresinya berubah menjadi lega dan tersenyum
tipis. Terakhir ia berjalan pergi dengan langkah ringan menyusuri koridor.

KAMERA: satu shot mengalir tanpa potongan — mulai medium shot rak arsip, dorong perlahan ke
close-up wajah, lalu tarik mundur perlahan saat ia berjalan pergi.
PENCAHAYAAN: sore keemasan, sinar matahari menembus jendela, partikel debu cahaya, bayangan
lembut, palet hangat dengan aksen hijau kebiruan.
SUASANA: tenang dan melegakan, bukan dramatis.

AUDIO: tanpa dialog karakter. Hanya musik piano instrumental tipis dan lembut, tanpa lirik.

JANGAN: tanpa teks, subtitle, atau tulisan apa pun di layar, tanpa logo atau merek, tanpa
tulisan yang terbaca di binder maupun tablet, tanpa pasien atau ranjang pasien di frame, tanpa
tindakan medis apa pun, tanpa darah atau alat medis invasif, tanpa karakter yang berbicara
menghadap kamera, tanpa gaya chibi atau super-deformed, tanpa fanservice.
```

## Varian — kartun flat (kalau anime terasa terlalu "Jepang" untuk audiens RS)

Struktur detik dan teks layarnya sama persis; hanya gayanya yang berganti. Karakter lebih
sederhana, mudah dipakai ulang jadi seri.

### PROMPT VIDEO — kartun flat (paste ke Gemini)

```
Buat video animasi 2D bergaya kartun flat modern (flat vector motion graphic), durasi 10 detik,
rasio 9:16 vertikal. Bentuk sederhana, garis tebal rapi, palet warna teal dan putih dengan
aksen oranye hangat, tanpa gradasi rumit.

ADEGAN: Seorang karakter perawat perempuan bergaya kartun sederhana berdiri di depan tumpukan
map dan binder yang tinggi, menggaruk kepala dengan bingung. Lalu ia memegang tablet, dan
tumpukan map di belakangnya menyusut rapi menjadi satu ikon dokumen. Karakter tersenyum lega
dan mengacungkan jempol.

KAMERA: gerak kamera datar sederhana, dorong perlahan ke tengah frame, tanpa potongan.
SUASANA: ringan, ramah, optimis, tempo santai.

AUDIO: tanpa dialog karakter. Musik instrumental ceria ringan, tanpa lirik, volume rendah.

JANGAN: tanpa teks, subtitle, atau tulisan apa pun di layar, tanpa logo atau merek, tanpa
tulisan yang terbaca di map maupun tablet, tanpa pasien atau ranjang pasien di frame, tanpa
tindakan medis apa pun, tanpa alat medis invasif, tanpa karakter yang berbicara menghadap
kamera.
```

## Checklist sebelum tayang

- Detik 7–10 wajib memuat alamat situs **dan** kalimat "bukan alat keputusan klinis" di layar —
  banyak yang menonton tanpa pernah membaca caption.
- Subtitle voiceover dibakar ke video (burn-in); mayoritas menonton tanpa suara.
- Unggah video native ke Facebook/Instagram, jangan tempel tautan YouTube.
- Tautan tetap ditulis di caption, bukan hanya di komentar pertama.
- Jam tayang mengikuti `scripts/content/schedule.mjs`: 16.15 WIB.
- Kalau hasil render memunculkan tulisan berantakan di binder atau layar tablet, render ulang —
  jangan diakali dengan blur, itu justru mengarahkan mata ke sana.
