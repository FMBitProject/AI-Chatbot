# Paket vertikal — Rumah Sakit & Klinik (7 Agustus 2026)

Bukan paket harian. Ini 3 set konten khusus vertikal RS yang bisa disisipkan kapan saja
di antara paket mingguan, masing-masing: caption LinkedIn · Facebook · Instagram +
1 prompt video 10 detik untuk Gemini.

> Ditulis manual (bukan hasil `scripts/content/generate.mjs`), lalu dicek dengan
> `node scripts/content/lint.mjs content/packs/2026-08-07-rumahsakit.md` — bersih.

Kosakata dan situasinya diambil dari halaman `/solusi/rumah-sakit` supaya post dan
landing page tidak bercerita berbeda. Tiga pagar yang tidak boleh dilanggar di vertikal ini:

1. **Bukan alat keputusan klinis.** Selalu posisikan sebagai pencarian dokumen internal.
2. **Bukan rekam medis pasien.** Yang diunggah adalah dokumen kebijakan & prosedur.
3. **Transparan soal Gemini/Groq.** Audiens RS akan menanyakan ke mana dokumen pergi.

**Cara pakai prompt video:** buka Gemini → pilih pembuatan video → paste blok "PROMPT VIDEO"
apa adanya. Teks di layar sengaja tidak diminta ke Gemini (model video masih sering menulis
huruf berantakan) — tambahkan sendiri di CapCut/Canva pakai baris "Teks di layar".

**Rekomendasi urutan tayang:** Set 1 → Set 3 → Set 2. Set 1 punya hook paling kuat
(jam 3 pagi) dan paling cepat dikenali orang lapangan; Set 3 menjelaskan kenapa produknya
ada; Set 2 paling teknis, cocok setelah audiens hangat.

---

# Set 1 — Jam 3 pagi

**Hook:** Pertanyaan prosedur di rumah sakit jarang datang saat bagian mutu masih di tempat.
**Value:** Tiga hal yang wajib ada di setiap halaman dokumen sebelum bicara alat apa pun.

### LinkedIn

Pertanyaan prosedur di rumah sakit jarang datang saat bagian mutu masih di tempat.

Jam tiga pagi, seorang perawat perlu memastikan satu langkah di SPO. Bagian mutu sudah pulang, supervisor sedang menangani pasien lain, dan binder di nurse station entah revisi tahun berapa. Yang terjadi berikutnya bisa ditebak: bertanya ke rekan yang kebetulan lebih senior, atau mengandalkan ingatan.

Langkah yang bisa dikerjakan minggu ini tanpa alat baru: pastikan setiap halaman dokumen memuat tiga hal — nomor revisi, tanggal berlaku, dan unit pemilik dokumen. Lalu tarik fotokopi lama dari dinding ruangan. Sebagian besar keraguan shift malam lahir dari dua versi yang sama-sama terlihat resmi.

Kami membangun IntelliBase supaya staf bisa bertanya langsung ke dokumen rumah sakit sendiri — clinical pathway, SPO, PPK, formularium — dan setiap jawaban menyertakan sitasi ke dokumen sumbernya, jadi bisa dicek ke halaman aslinya. Dokumen diindeks lewat Google Gemini dan dijawab dengan Groq; itu kami sampaikan terbuka. Ini alat pencarian dokumen internal, bukan alat pengambilan keputusan klinis.

Di rumah sakit Anda, ke mana staf shift malam bertanya saat ragu soal prosedur?

\#RumahSakit #MutuRS #KnowledgeManagement

### Facebook

Pertanyaan prosedur di rumah sakit jarang datang di jam kerja bagian mutu.

Jam tiga pagi, perawat butuh memastikan satu langkah SPO. Yang tersedia cuma binder di nurse station dan ingatan rekan yang kebetulan sedang tidak sibuk.

Sebelum memikirkan alat apa pun, satu perbaikan murah: cantumkan nomor revisi, tanggal berlaku, dan unit pemilik di setiap halaman dokumen — lalu tarik fotokopi lama dari dinding ruangan.

Kami membangun IntelliBase supaya staf bisa bertanya ke dokumen rumah sakit sendiri, dengan sitasi ke dokumen sumber di tiap jawaban. Dokumennya dikirim ke Google Gemini untuk diindeks dan ke Groq untuk menjawab — kami sebutkan terbuka. Untuk dokumen kebijakan dan prosedur, bukan rekam medis pasien, dan bukan alat keputusan klinis.

Bagaimana staf shift malam di tempat Anda mencari jawaban prosedur sekarang?

### Instagram

**Teks kartu (dicetak di gambar):**
> Jam 3 pagi, bagian mutu tidak bisa dihubungi. Prosedurnya tetap harus dijalankan.

**Caption:**

Pertanyaan prosedur di rumah sakit jarang datang di jam kerja.

Shift malam, staf orientasi, unit yang baru rotasi — semuanya butuh jawaban saat tidak ada yang bisa ditanya. Binder tebal dan folder share drive kalah cepat dari bertanya ke rekan.

Mulai dari yang murah: nomor revisi, tanggal berlaku, dan unit pemilik di setiap halaman dokumen.

Kami membangun IntelliBase supaya clinical pathway dan SPO rumah sakit bisa ditanyai langsung, lengkap dengan sitasi ke dokumen sumbernya. Alat pencarian dokumen internal, bukan pengganti keputusan klinis.

Jam berapa pertanyaan prosedur paling sering muncul di unit Anda?

\#rumahsakit #mutursi #spors #aiuntukbisnis

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Koridor rumah sakit Indonesia pada dini hari, sepi dan temaram. Di nurse station,
seorang perawat perempuan usia 25-35 tahun berseragam scrub polos membuka binder tebal
di bawah cahaya lampu meja, membalik halaman dengan ragu. Kursi lain kosong, jam dinding
menunjukkan dini hari.

KAMERA: satu shot tanpa potongan, dolly-in perlahan dari koridor menuju medium close-up
tangan yang membalik halaman binder.
PENCAHAYAAN: lampu koridor redup kehijauan, lampu meja hangat sebagai sumber utama,
kontras kuat, suasana tenang.

AUDIO: narator perempuan Indonesia, suara tenang dan jelas, tempo sedang, mengucapkan tepat
kalimat ini dalam Bahasa Indonesia: "Pertanyaan prosedur tidak menunggu jam kerja. Pastikan
staf bisa menemukan revisi terbaru sendiri, kapan pun."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di binder maupun layar, tanpa pasien atau ranjang pasien di frame, tanpa tindakan
medis apa pun, tanpa darah atau alat medis invasif, tanpa karakter yang berbicara menghadap
kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** JAM 3 PAGI, SPO-NYA YANG MANA?

---

# Set 2 — Fotokopi di dinding

**Hook:** Revisi terbaru sering kalah cepat dari fotokopi lama yang menempel di dinding ruangan.
**Value:** Cara menguji sistem tanya-jawab dokumen apa pun dengan satu dokumen yang baru direvisi.

### LinkedIn

Revisi terbaru sering kalah cepat dari fotokopi lama yang menempel di dinding ruangan.

Bukan karena staf menolak aturan baru. Yang menempel di dinding itu ada di depan mata, sementara versi resminya ada di folder yang butuh tiga klik dan kata kunci yang tepat. Saat pelayanan sedang padat, yang paling mudah dijangkau yang dipakai.

Kalau Anda sedang menimbang sistem tanya-jawab dokumen untuk rumah sakit, ada uji sederhana yang tidak butuh vendor: ambil satu dokumen yang baru saja direvisi. Masukkan versi barunya. Ajukan pertanyaan yang jawabannya berubah antara revisi lama dan baru. Lalu periksa dua hal — apakah jawabannya mengikuti versi terbaru, dan apakah ia menunjukkan dokumen serta halaman asalnya.

Kalau sistem menjawab tanpa menyebut sumbernya, bagian mutu tetap harus memverifikasi manual. Tidak ada yang berubah selain tampilannya.

Di IntelliBase, tiap jawaban membawa sitasi ke dokumen yang Anda unggah sendiri. Ini alat pencarian dokumen internal untuk kebijakan dan prosedur — keputusan klinis tetap sepenuhnya di tangan tenaga kesehatan.

Bagaimana rumah sakit Anda memastikan revisi lama benar-benar berhenti dipakai?

\#RumahSakit #Akreditasi #MutuRS

### Facebook

Revisi terbaru sering kalah cepat dari fotokopi lama yang menempel di dinding ruangan.

Masalahnya bukan kemauan staf, tapi jarak. Kertas di dinding ada di depan mata; versi resminya ada di folder yang harus dicari.

Uji sederhana sebelum membeli sistem apa pun: ambil satu dokumen yang baru direvisi, ajukan pertanyaan yang jawabannya berubah, lalu cek apakah sistem menjawab sesuai versi terbaru dan menyebut dokumen sumbernya.

Tanpa sitasi, bagian mutu tetap harus mengecek ulang satu per satu. Di IntelliBase, tiap jawaban menyertakan dokumen asalnya supaya bisa diverifikasi sendiri.

Bagaimana cara tim Anda menarik dokumen versi lama dari peredaran?

### Instagram

**Teks kartu (dicetak di gambar):**
> Fotokopi lama di dinding ruangan hampir selalu menang dari revisi terbaru di folder.

**Caption:**

Revisi terbaru sering kalah cepat dari fotokopi lama di dinding ruangan.

Bukan soal kepatuhan. Yang ada di depan mata selalu lebih mudah dipakai daripada file yang harus dicari.

Uji sistem apa pun dengan satu dokumen yang baru direvisi: ajukan pertanyaan yang jawabannya berubah, lalu cek apakah jawabannya mengikuti versi baru dan menyebut dokumen sumbernya.

Itu prinsip yang kami pakai di IntelliBase — tiap jawaban membawa sitasi ke dokumen yang Anda unggah.

Kapan terakhir kali dinding ruangan Anda dibersihkan dari dokumen kedaluwarsa?

\#rumahsakit #akreditasirs #spors #manajemendokumen

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Ruang kerja unit di rumah sakit Indonesia, siang hari. Dinding berisi beberapa lembar
kertas menempel yang sudah menguning dan bergelombang. Seorang staf usia 30-40 tahun
berseragam rapi berdiri di depan dinding sambil memegang satu berkas baru yang masih putih
bersih, membandingkan keduanya dengan dahi berkerut.

KAMERA: satu shot tanpa potongan, gerak lateral perlahan menyusuri dinding, berakhir pada
staf yang memegang berkas baru.
PENCAHAYAAN: siang hari, cahaya jendela natural, sedikit datar, realistis.

AUDIO: narator laki-laki Indonesia, suara tenang dan berwibawa, tempo sedang, mengucapkan
tepat kalimat ini dalam Bahasa Indonesia: "Revisi terbaru sering kalah cepat dari fotokopi
lama di dinding. Pastikan setiap jawaban menunjukkan dokumen sumbernya."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di kertas, tanpa pasien atau ranjang pasien di frame, tanpa tindakan medis apa pun,
tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** REVISI BERAPA YANG MENEMPEL DI DINDING ANDA?

---

# Set 3 — Dibangun oleh dokter

**Hook:** Rumah sakit bukan kantor dengan istilah yang lebih rumit.
**Value:** Kenapa dokumen RS butuh perlakuan berbeda — siklus revisi, rotasi staf, dan pelayanan 24 jam.

### LinkedIn

Rumah sakit bukan kantor biasa dengan istilah yang lebih rumit.

Tiga hal membuat dokumennya berperilaku berbeda. Pelayanan berjalan 24 jam, jadi pertanyaan muncul di jam yang tidak ada penanggung jawab dokumen. Clinical pathway, SPO, PPK, formularium, dan panduan akreditasi punya siklus revisinya masing-masing, sering berlapis. Dan stafnya terus berganti — perawat orientasi, dokter internsip, staf yang pindah unit — sehingga pertanyaan yang sama diulang ke orang yang sama sepanjang tahun.

Alat pencarian dokumen yang dirancang untuk kebijakan HR biasanya kehilangan ketiganya. Ia tidak mengerti bahwa "PPK" dan "panduan praktik klinis" adalah hal yang sama, dan tidak menganggap penting dari revisi mana sebuah jawaban datang.

IntelliBase dibangun oleh seorang dokter yang belajar membuat perangkat lunak, dan rumah sakit adalah industri yang kami dalami paling serius. Setiap jawaban membawa sitasi ke dokumen yang Anda unggah. Isolasi data antar tenant ditegakkan di level database dan sudah kami uji. Dokumen diindeks lewat Google Gemini dan dijawab dengan Groq — itu kami sampaikan di depan, bukan di halaman syarat.

Dokumen apa yang paling sering dicari staf di rumah sakit Anda?

\#RumahSakit #KlinikIndonesia #MutuRS

### Facebook

Rumah sakit bukan kantor biasa dengan istilah yang lebih rumit.

Pelayanan jalan 24 jam, dokumennya berlapis dan sering direvisi, dan stafnya terus berotasi. Tiga hal itu membuat pencarian dokumen di RS berperilaku beda dari kantor pada umumnya.

IntelliBase dibangun oleh seorang dokter yang belajar membuat perangkat lunak, dan rumah sakit adalah industri yang kami dalami paling serius: clinical pathway, SPO, PPK, formularium, panduan akreditasi.

Setiap jawaban menyertakan sitasi ke dokumen yang Anda unggah sendiri. Isolasi data antar rumah sakit ditegakkan di level database dan sudah diuji. Dokumen dikirim ke Google Gemini untuk diindeks dan ke Groq untuk menjawab — kami sebutkan terbuka.

Untuk dokumen kebijakan dan prosedur, bukan rekam medis pasien.

Dokumen apa yang paling sering dicari staf Anda?

### Instagram

**Teks kartu (dicetak di gambar):**
> Pelayanan 24 jam. Dokumen berlapis. Staf berotasi. Tiga alasan dokumen RS beda.

**Caption:**

Rumah sakit bukan kantor biasa dengan istilah yang lebih rumit.

Pelayanan jalan 24 jam, jadi pertanyaan datang saat penanggung jawab dokumen tidak ada. Dokumennya berlapis dan sering direvisi. Stafnya berotasi terus, jadi pertanyaan yang sama diulang sepanjang tahun.

IntelliBase dibangun oleh seorang dokter yang belajar membuat perangkat lunak — clinical pathway, SPO, PPK, dan formularium bisa ditanyai langsung, dengan sitasi ke dokumen sumbernya.

Untuk dokumen kebijakan dan prosedur, bukan rekam medis pasien.

Unit mana di tempat Anda yang paling sering menanyakan ulang prosedur?

\#rumahsakit #klinik #spors #aiuntukbisnis

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter.

ADEGAN: Ruang administrasi rumah sakit Indonesia yang bersih dan terang. Rak arsip berisi
map dan binder tebal berjajar. Seorang staf medis usia 30-40 tahun berjas putih polos berjalan
pelan menyusuri rak sambil menyentuh punggung map, lalu berhenti dan menarik satu binder.

KAMERA: satu shot tanpa potongan, tracking mengikuti staf dari belakang menyusuri rak,
berakhir saat tangan menarik binder dari rak.
PENCAHAYAAN: siang hari, cahaya natural dari jendela samping, bersih, kontras lembut.

AUDIO: narator perempuan Indonesia, suara jelas dan ramah, tempo sedang, mengucapkan tepat
kalimat ini dalam Bahasa Indonesia: "Pelayanan dua puluh empat jam, dokumen berlapis, staf
berotasi. Dokumen rumah sakit butuh perlakuan yang berbeda."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di map maupun binder, tanpa pasien atau ranjang pasien di frame, tanpa tindakan medis
apa pun, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** DOKUMEN RS TIDAK SAMA DENGAN DOKUMEN KANTOR
