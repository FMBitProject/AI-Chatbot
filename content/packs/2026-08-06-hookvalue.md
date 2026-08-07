# Konten Kamis–Minggu, 6–9 Agustus 2026 — format Hook + Value

Platform: **LinkedIn · Facebook · Instagram**. Satu post per hari per platform (12 post),
plus 1 prompt video 10 detik per hari untuk di-paste ke Gemini.

> Dibuat dengan `gemini-3.6-flash` memakai system prompt `scripts/content/brand-facts.mjs`,
> lalu setiap teks dicek dengan `scripts/content/lint.mjs` dan bersih dari seluruh kelas klaim
> terlarang di sana.

**Cara pakai prompt video:** buka Gemini → pilih pembuatan video → paste blok "PROMPT VIDEO"
apa adanya. Teks di layar **sengaja tidak diminta ke Gemini** — model video masih sering
menulis huruf yang berantakan. Tambahkan sendiri di CapCut/Canva pakai baris "Teks di layar".

---

# Kamis, 6 Agustus 2026

**Hook:** Karyawan baru Anda sibuk bertanya hal yang sebenarnya ada di dokumen onboarding.
**Value:** Yang perlu dirapikan itu struktur dokumennya, bukan jadwal sesi pengarahannya.

### LinkedIn

Karyawan baru Anda sibuk bertanya hal yang sebenarnya ada di dokumen onboarding.

Minggu pertama biasanya dihabiskan untuk menanyakan hal-hal dasar: cara klaim medis, jatah cuti, hingga akses WiFi kantor. Padahal semua jawaban itu sudah tertulis rapi di PDF panduan yang Anda kirim sebelum hari pertama mereka bekerja.

Masalahnya bukan pada niat membaca, melainkan pada kemudahan akses. Saat karyawan butuh jawaban cepat, mencari di dokumen puluhan halaman terasa lambat. Akibatnya tim HR atau atasan langsung kembali menjadi tempat bertanya manual.

Solusi termudah tanpa alat baru: buat ringkasan FAQ satu halaman dengan tautan langsung ke halaman dokumen yang relevan.

Di IntelliBase, kami mencoba menyelesaikan ini dengan membiarkan karyawan bertanya pakai bahasa sehari-hari ke dokumen perusahaan. Dokumen diindeks lewat Google Gemini dan dijawab dengan Groq, lengkap dengan sitasi ke dokumen sumbernya.

Berapa kali tim HR Anda menjawab pertanyaan onboarding yang sama minggu ini?

\#HRIndonesia #Onboarding #KnowledgeManagement

### Facebook

Karyawan baru Anda sibuk bertanya hal yang sebenarnya ada di dokumen onboarding.

Minggu pertama sering diisi pertanyaan dasar yang berulang: cara mengajukan lembur, aturan kerja remote, sistem reimburse. Padahal berkas PDF panduan sudah diserahkan di hari pertama.

Kenapa? Karena mencari jawaban spesifik di dokumen tebal itu melelahkan. Bertanya ke HR terasa jauh lebih cepat.

Sebelum membeli alat bantu apa pun, Anda bisa mulai dari merapikan satu lembar FAQ berisi pertanyaan yang paling sering masuk.

Kami di IntelliBase membangun asisten AI yang membaca dokumen internal supaya karyawan bisa bertanya sendiri. Dokumennya dikirim ke Google Gemini untuk diindeks dan ke Groq untuk menjawab — itu kami sampaikan terbuka.

Tim Anda masih menjawab pertanyaan onboarding satu per satu secara manual?

### Instagram

**Teks kartu (dicetak di gambar):**
> Dokumen onboarding tebal jarang dibaca. Karyawan baru lebih pilih bertanya.

**Caption:**

Karyawan baru Anda sibuk bertanya hal yang sebenarnya ada di dokumen onboarding.

Setiap kali ada anggota baru, tim HR mengulang jawaban tentang klaim medis atau jam kerja. Masalahnya bukan dokumen yang kurang lengkap, tapi formatnya yang sulit dicari dengan cepat.

Coba buat dokumen ringkas satu halaman berisi FAQ utama. Kalau ingin otomatis, kami membangun IntelliBase supaya karyawan bisa langsung bertanya ke dokumen lewat AI.

Bagaimana proses onboarding karyawan baru di kantor Anda saat ini?

\#hrindonesia #onboardingkaryawan #sopperusahaan #aiuntukbisnis

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Suasana kantor modern di Jakarta. Seorang karyawan usia 25-35 tahun berpakaian kerja
rapi kasual duduk di depan laptop, tampak bingung, sesekali melirik tumpukan berkas di sebelah
laptopnya. Cahaya alami dari jendela besar di belakangnya.

KAMERA: satu shot tanpa potongan, dolly-in perlahan dari medium shot ke medium close-up.
PENCAHAYAAN: siang hari, natural, hangat, sedikit halasi lembut dari jendela.

AUDIO: narator perempuan Indonesia, suara tenang dan jelas, tempo sedang, mengucapkan tepat
kalimat ini dalam Bahasa Indonesia: "Karyawan baru Anda sibuk bertanya hal yang sebenarnya
sudah ada di dokumen onboarding. Rapikan FAQ-nya, bukan jadwal pengarahannya."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tampilan layar
aplikasi yang terbaca, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** ONBOARDING, TANYA HAL YANG SAMA LAGI?

---

# Jumat, 7 Agustus 2026

**Hook:** Dua versi SOP beredar dan tidak ada yang tahu mana yang berlaku.
**Value:** Jawaban yang terdengar meyakinkan tidak ada gunanya kalau sumbernya tidak bisa dicek.

### LinkedIn

Dua versi SOP beredar dan tidak ada yang tahu mana yang berlaku.
Ini sering terjadi saat revisi kebijakan dibuat tanpa menarik dokumen lama dari folder bersama. Karyawan yang ingin bekerja cepat memakai dokumen yang paling mudah ditemukan, meskipun isinya sudah kedaluwarsa.

Masalah utamanya bukan kemauan karyawan membaca, melainkan kejelasan sumber informasi. Jawaban yang terdengar meyakinkan atau dokumen yang tampak rapi tidak menjamin kepatuhan pada standar operasional yang berlaku.

Karena itu, setiap instruksi operasional idealnya menyertakan rujukan langsung: nama berkas, nomor revisi, dan tanggal berlaku. Tanpa itu, kesalahan kerja yang sama akan terus berulang di lapangan.

Prinsip yang sama berlaku untuk sistem apa pun yang menjawab pertanyaan karyawan: jawaban harus selalu menunjukkan dari dokumen mana ia diambil. Di IntelliBase, setiap jawaban menyertakan sitasi ke dokumen sumber, jadi karyawan bisa memverifikasi sendiri sebelum bertindak.

Bagaimana cara tim Anda memastikan karyawan selalu memakai versi SOP paling baru?

\#SOP #HRIndonesia #Compliance

### Facebook

Dua versi SOP beredar dan tidak ada yang tahu mana yang berlaku.

Kejadian ini sangat umum di kantor. Ketika ada revisi kebijakan HR atau panduan operasional, file lama sering lupa dihapus dari folder bersama. Karyawan akhirnya bekerja dengan acuan yang berbeda-beda.

Petunjuk yang terdengar meyakinkan tidak ada gunanya kalau bersumber dari dokumen yang salah. Kepastian sumber jauh lebih penting daripada sekadar kepraktisan.

Setiap informasi kerja idealnya disertai rujukan ke dokumen aslinya. Di IntelliBase, kami menyertakan sitasi dokumen sumber di setiap jawaban supaya tim bisa mengecek keabsahannya sendiri.

Bagaimana kantor Anda memastikan versi SOP lama tidak dipakai lagi?

### Instagram

**Teks kartu (dicetak di gambar):**
> Jawaban yang meyakinkan tidak berguna kalau sumbernya dokumen yang salah.

**Caption:**

Dua versi SOP beredar dan tidak ada yang tahu mana yang berlaku.

Kondisi ini muncul karena berkas lama tidak segera ditarik saat ada kebijakan baru. Akibatnya karyawan memakai standar yang berbeda saat mengambil keputusan.

Petunjuk kerja yang rapi tidak ada artinya kalau berasal dari sumber yang salah. Di IntelliBase, setiap jawaban dilengkapi sitasi ke dokumen sumbernya supaya bisa dicek sendiri.

Pernah ada tugas yang salah dieksekusi di tim Anda gara-gara SOP ganda?

\#sopperusahaan #hrindonesia #manajemendokumen #aiuntukbisnis

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Meja kerja kantor modern Indonesia yang cerah. Seorang staf usia 28-40 tahun
membandingkan dua tumpukan dokumen kertas di kiri dan kanan laptopnya, bergantian melihat
keduanya dengan ragu. Jendela besar di belakang, tanaman hijau di sudut ruangan.

KAMERA: satu shot tanpa potongan, gerak lateral perlahan dari kiri ke kanan melewati meja,
berakhir pada wajah staf yang tampak ragu.
PENCAHAYAAN: siang hari, natural, bersih, kontras lembut.

AUDIO: narator laki-laki Indonesia, suara tenang dan berwibawa, tempo sedang, mengucapkan
tepat kalimat ini dalam Bahasa Indonesia: "Dua versi SOP beredar dan tidak ada yang tahu mana
yang berlaku. Jawaban tanpa sitasi sumber bisa menyesatkan."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di kertas maupun di layar laptop, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** SOP MANA YANG BERLAKU HARI INI?

---

# Sabtu, 8 Agustus 2026

**Hook:** Setiap minggu, pertanyaan HR yang masuk ke obrolan tim selalu sama.
**Value:** Cara menguji asisten AI internal apa pun dalam 30 menit, tanpa percaya janji vendor.

### LinkedIn

Setiap minggu, pertanyaan HR yang masuk ke obrolan tim selalu sama.

Kalau Anda sedang menimbang asisten AI internal, ada cara sederhana mengujinya dalam 30 menit — tanpa perlu percaya janji vendor.

1. Kumpulkan 10 pertanyaan yang paling sering ditanyakan karyawan soal SOP, cuti, atau klaim medis.
2. Masukkan dokumen yang relevan ke dalam sistem.
3. Ajukan 10 pertanyaan itu, lalu periksa dua hal: apakah jawabannya tepat, dan apakah ada sitasi jelas ke dokumen sumbernya.

Kalau AI menjawab tanpa menyebut dokumen asalnya, Anda tidak punya cara memverifikasi kebenarannya — dan untuk urusan kebijakan perusahaan, itu risiko yang mahal.

Di IntelliBase, setiap jawaban menyertakan sitasi ke dokumen pendukung, jadi karyawan bisa mengecek sendiri. Uji coba 30 menit ini membantu Anda membedakan alat yang siap pakai dari yang hanya menjual janji.

Apa pertanyaan SOP yang paling sering ditanyakan karyawan di perusahaan Anda?

\#HRIndonesia #AI #EvaluasiVendor

### Facebook

Setiap minggu, pertanyaan HR yang masuk ke obrolan tim selalu sama. Mulai dari aturan cuti sampai prosedur klaim kesehatan.

Kalau Anda sedang mempertimbangkan asisten AI untuk menjawab pertanyaan internal, jangan terburu-buru. Luangkan 30 menit untuk mengujinya sendiri.

Caranya: siapkan 10 pertanyaan tersering beserta dokumen SOP-nya. Minta AI menjawab, lalu cek apakah jawabannya menyertakan rujukan dokumen yang jelas. Tanpa sitasi, tim Anda tetap harus mengecek ulang secara manual — dan tidak ada waktu yang terhemat.

Kami menerapkan prinsip ini di IntelliBase karena data kebijakan HR terlalu berisiko untuk dijawab tanpa sumber.

Bagaimana biasanya Anda menguji alat baru sebelum dipakai tim Anda?

### Instagram

**Teks kartu (dicetak di gambar):**
> Tes AI internal dalam 30 menit: pakai 10 pertanyaan SOP paling sering.

**Caption:**

Setiap minggu, pertanyaan HR yang masuk ke obrolan tim selalu sama.

Sebelum memakai AI internal, uji dulu dalam 30 menit. Siapkan 10 pertanyaan SOP tersering, lalu periksa apakah AI menjawabnya lengkap dengan sitasi ke dokumen sumbernya.

Tanpa rujukan yang jelas, tim HR tetap harus mengecek ulang satu per satu. Di IntelliBase, setiap jawaban mencantumkan dokumen asalnya supaya mudah diverifikasi.

Bagaimana Anda biasanya memvalidasi klaim vendor teknologi?

\#hrindonesia #aiuntukbisnis #sopperusahaan #tipskantor

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Meja kerja kayu yang rapi di kantor modern Jakarta, laptop terbuka, buku catatan dan
pulpen di sampingnya, secangkir kopi mengepul. Seorang manajer usia 30-45 tahun duduk sambil
menuliskan daftar di buku catatan, fokus dan tenang.

KAMERA: satu shot tanpa potongan, dolly-in perlahan dari atas meja menuju tangan yang menulis.
PENCAHAYAAN: pagi hari, natural, cerah, bayangan lembut.

AUDIO: narator perempuan Indonesia, suara jelas dan ramah, tempo sedang, mengucapkan tepat
kalimat ini dalam Bahasa Indonesia: "Setiap minggu, pertanyaan HR yang masuk selalu sama.
Kumpulkan sepuluh pertanyaan tersering, lalu uji apakah AI menjawabnya dengan sitasi dokumen."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tulisan yang
terbaca di buku catatan maupun di layar laptop, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** TES AI INTERNAL DALAM 30 MENIT

---

# Minggu, 9 Agustus 2026

**Hook:** Sebagian besar operasional perusahaan Anda sebenarnya tersimpan di kepala dua orang.
**Value:** Dokumentasi baru berguna kalau mudah diakses, bukan kalau rapi tersusun di folder.

### LinkedIn

Sebagian besar operasional perusahaan Anda sebenarnya tersimpan di kepala dua orang.

Folder Drive perusahaan mungkin penuh dokumen SOP, panduan kerja, dan kebijakan internal. Tapi saat tim punya pertanyaan teknis, mereka jarang membuka folder itu. Mereka hampir selalu mengirim pesan ke Senior Ops atau HR Manager yang sama.

Ini menciptakan dua hal sekaligus: beban kerja berulang bagi orang yang dianggap tahu segalanya, dan risiko besar saat orang itu cuti atau mengundurkan diri.

Ketergantungan ini muncul karena mencari jawaban di tumpukan dokumen memakan waktu lebih lama daripada bertanya langsung. Selama itu benar, dokumentasi sebagus apa pun akan tetap dilewati.

Kami membangun IntelliBase untuk memutus pola itu: karyawan bertanya sendiri ke dokumen internal, tanpa perlu mengganggu rekan kerja. Dokumentasi baru berguna saat mudah diakses.

Siapa satu orang di tim Anda yang paling sering dihubungi saat ada pertanyaan operasional?

\#KnowledgeManagement #HRIndonesia #OperasionalBisnis

### Facebook

Sebagian besar operasional perusahaan Anda sebenarnya tersimpan di kepala dua orang.

Setiap kali ada anggota tim yang bingung, mereka jarang membuka file SOP di Drive. Mereka mengirim pesan ke senior yang paling paham. Praktis untuk sementara, melelahkan untuk senior tersebut.

Saat pengetahuan hanya ada di kepala staf kunci, operasional rentan tersendat begitu mereka cuti atau pindah kerja.

Langkah kecil yang bisa dimulai hari ini: biasakan setiap jawaban atas pertanyaan rutin dicatat di satu tempat yang bisa diakses siapa saja.

Kami membangun IntelliBase sebagai asisten AI yang membaca dokumen internal Anda dan menjawab pertanyaan karyawan dari sana.

Bagaimana tim Anda mengelola dokumen operasional saat ini?

### Instagram

**Teks kartu (dicetak di gambar):**
> SOP lengkap di Drive tidak berguna kalau tim tetap bertanya ke orang yang sama.

**Caption:**

Sebagian besar operasional perusahaan Anda sebenarnya tersimpan di kepala dua orang.

Di banyak tim, folder Drive yang rapi justru tidak tersentuh. Karyawan lebih memilih bertanya ke orang yang sama setiap hari. Pengetahuan yang bergantung pada individu bikin operasional rawan mandek saat staf kunci libur.

Kuncinya: bikin dokumen internal mudah diakses sendiri. Itu yang kami kerjakan lewat IntelliBase.

Tim Anda juga punya satu orang yang "tahu semua hal"?

\#knowledgemanagement #hrindonesia #sopperusahaan #operasionalbisnis

### PROMPT VIDEO — 10 detik (paste ke Gemini)

```
Buat video realistis berdurasi 10 detik, rasio 9:16 vertikal, gaya sinematik dokumenter korporat.

ADEGAN: Kantor modern di Jakarta menjelang sore, ruangan mulai sepi dan sebagian kursi kosong.
Seorang karyawan senior usia 35-45 tahun masih di mejanya, mengetik sambil sesekali berhenti
untuk menjawab pesan di ponsel, raut wajah lelah tapi sabar.

KAMERA: satu shot tanpa potongan, dolly-in sangat perlahan dari wide shot ruangan menuju
medium shot karyawan tersebut.
PENCAHAYAAN: cahaya sore hangat keemasan dari jendela, bayangan panjang.

AUDIO: narator laki-laki Indonesia, suara tenang dan reflektif, tempo pelan, mengucapkan tepat
kalimat ini dalam Bahasa Indonesia: "Sebagian besar operasional perusahaan Anda sebenarnya
tersimpan di kepala dua orang. Buat dokumennya mudah diakses sendiri sebelum mereka resign."
Musik latar instrumental tipis, tanpa lirik, volume rendah.

JANGAN: tanpa teks atau subtitle di layar, tanpa logo atau merek apa pun, tanpa tampilan layar
ponsel atau laptop yang terbaca, tanpa karakter yang berbicara menghadap kamera.
```

**Teks di layar (tambahkan sendiri di CapCut/Canva):** PENGETAHUAN KANTOR TIDAK ADA DI DRIVE
