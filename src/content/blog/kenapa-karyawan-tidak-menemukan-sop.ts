import type { BlogPost } from "@/lib/blog";

// No markdown tables anywhere in these bodies: react-markdown is running without
// remark-gfm (it is not a dependency), so GFM syntax — tables, strikethrough,
// task lists — renders as literal pipes and tildes instead of markup. Headings,
// lists, blockquotes, links, emphasis and rules are CommonMark and are safe.
export const sopTidakKetemu: BlogPost = {
  slug: "kenapa-karyawan-tidak-menemukan-sop",
  title: "Kenapa Karyawan Anda Tidak Pernah Menemukan SOP yang Mereka Cari",
  metaTitle: "Kenapa Karyawan Tidak Menemukan SOP yang Mereka Cari",
  description:
    "SOP sudah ditulis, disetujui, dan diunggah ke share drive — tapi staf tetap bertanya ke rekan sebelah. Penyebabnya bukan kedisiplinan, dan folder baru tidak menyelesaikannya.",
  excerpt:
    "Dokumennya ada. Masalahnya bukan penulisan, melainkan pengambilan — dan itu masalah yang sama sekali berbeda.",
  publishedAt: "2026-08-08",
  readingMinutes: 7,
  body: `Ada satu pemandangan yang berulang di hampir semua perusahaan berkaryawan
20–200: bagian mutu atau HR menghabiskan berminggu-minggu menyusun SOP, dokumen
itu disetujui, diunggah ke share drive — lalu enam bulan kemudian seorang staf
tetap berdiri di meja rekannya dan bertanya, "eh, ini prosedurnya gimana ya?"

Reaksi yang paling umum adalah menyalahkan kedisiplinan. Sosialisasi diulang,
folder dirapikan, penamaan file diseragamkan, dan selama beberapa minggu keadaan
membaik. Lalu kembali seperti semula.

Itu terjadi karena masalahnya salah didiagnosis.

## Menulis dokumen dan mengambil dokumen adalah dua masalah berbeda

Perusahaan Anda kemungkinan besar sudah menyelesaikan masalah pertama. Dokumennya
ada, isinya benar, dan disetujui orang yang berwenang.

Yang belum selesai adalah masalah kedua: bagaimana seseorang yang punya
pertanyaan spesifik, pada jam kerja yang sibuk, sampai ke paragraf yang menjawab
pertanyaan itu — bukan ke dokumennya, tapi ke paragrafnya.

Jarak antara "dokumen itu ada di suatu tempat" dan "kalimat yang dibutuhkan sudah
ada di depan mata" jauh lebih besar dari yang terlihat. Dan setiap langkah di
jarak itu adalah tempat orang menyerah lalu bertanya ke rekan sebelah, yang jauh
lebih cepat.

## Empat sebab yang sebenarnya

### 1. Orang mencari dengan pertanyaan, dokumen disimpan dengan judul

Seorang staf baru tidak mencari "SOP-HRD-014-Rev3-final.pdf". Yang ada di
kepalanya adalah: *"kalau sakit dua hari, perlu surat dokter atau tidak?"*

Jawabannya mungkin memang ada di file itu, di halaman 7. Tapi tidak ada satu kata
pun dari pertanyaan tadi yang muncul di nama filenya. Sistem penyimpanan Anda
terorganisasi menurut cara penyusun berpikir; pencarian dilakukan menurut cara
pengguna berpikir. Keduanya jarang bertemu.

### 2. Pencarian bawaan hanya mencocokkan kata, bukan makna

Pencarian di share drive dan di sebagian besar sistem berbagi file bekerja dengan
mencocokkan kata kunci. Kalau dokumen Anda menulis "izin tidak masuk kerja karena
alasan kesehatan" dan staf mengetik "sakit", kemungkinan besar tidak ada yang
muncul.

Ini bukan kesalahan siapa pun. Bahasa Indonesia formal di dokumen resmi memang
hampir selalu berbeda dari bahasa yang dipakai orang saat bertanya. Semakin rapi
dan formal SOP Anda, semakin jauh jaraknya dari kata yang diketik staf.

### 3. Versi lama tidak pernah benar-benar hilang

Revisi ketiga diunggah ke folder baru. Revisi pertama masih ada di email tahun
lalu, di grup WhatsApp divisi, dan dalam bentuk fotokopi yang menempel di dinding
ruangan.

Ketika seseorang akhirnya menemukan *sebuah* dokumen, tidak ada cara cepat untuk
tahu apakah itu yang terbaru. Sebagian orang lalu memilih tidak memakainya sama
sekali — dan bertanya ke orang, yang setidaknya bisa bilang "oh itu sudah
diganti".

### 4. Sebagian besar prosedur tidak pernah ditulis

Ini yang paling jarang diakui. Di setiap tim ada satu atau dua orang yang menjadi
tempat bertanya semua orang. Pengetahuan mereka nyata dan dipakai setiap hari,
tapi tidak ada di dokumen mana pun.

Selama orang itu masih ada, sistemnya "jalan". Masalahnya baru terlihat saat ia
cuti panjang, pindah divisi, atau resign — dan ternyata tidak ada yang tahu apa
yang selama ini ia ketahui.

## Kenapa merapikan folder tidak menyelesaikan masalah

Merapikan struktur folder memperbaiki penyimpanan, bukan pengambilan. Setelah
dirapikan, staf tetap harus menebak dokumen mana yang relevan, membukanya,
lalu memindai isinya.

Yang sebenarnya dibutuhkan adalah kemampuan mengajukan pertanyaan dengan bahasa
biasa, dan mendapat jawaban yang menyebutkan dari dokumen mana jawaban itu
diambil.

Bagian kedua itu yang sering dilupakan. Jawaban tanpa rujukan hanya memindahkan
masalahnya: staf tetap tidak tahu apakah boleh mempercayainya. Jawaban yang
menyertakan sumber bisa diperiksa sendiri dalam hitungan detik, dan itulah yang
membuat orang berhenti bertanya ke rekan sebelah.

## Yang bisa Anda lakukan minggu ini, tanpa membeli apa pun

Empat langkah ini tidak memerlukan perangkat lunak baru, dan hasilnya sudah cukup
untuk mengetahui seberapa besar masalah Anda sebenarnya:

1. **Catat pertanyaan yang masuk, bukan dokumen yang ada.** Selama satu minggu,
   minta HR dan supervisor mencatat setiap pertanyaan prosedur yang mereka
   terima. Daftar ini jauh lebih berharga daripada daftar dokumen Anda — ini
   adalah kebutuhan sebenarnya.
2. **Coba cari jawabannya sendiri.** Ambil sepuluh pertanyaan teratas, lalu cari
   jawabannya di sistem yang ada sekarang sambil menghitung waktu. Kalau Anda
   sendiri kesulitan, staf baru tidak punya harapan.
3. **Tandai pertanyaan yang tidak ada dokumennya.** Itu bukan kegagalan
   pencarian, melainkan pengetahuan yang memang belum pernah ditulis. Ini yang
   harus ditulis lebih dulu.
4. **Tetapkan satu tempat resmi per topik.** Satu sumber yang disepakati, dan
   semua salinan lain secara eksplisit dinyatakan tidak berlaku.

Sesudah empat langkah itu, Anda punya sesuatu yang lebih berguna daripada
perasaan bahwa "dokumen kami berantakan": daftar konkret pertanyaan nyata, dan
data tentang berapa lama waktu yang dibutuhkan untuk menjawabnya hari ini.

## Di mana perangkat lunak masuk

Kalau daftar pertanyaan tadi panjang dan sebagian besar jawabannya ternyata
*sudah ada* di dokumen Anda, masalahnya memang pengambilan — dan itu bisa
dibantu alat.

Inilah yang IntelliBase kerjakan: dokumen internal Anda diindeks, staf bertanya
dengan bahasa biasa, dan setiap jawaban menyertakan sitasi ke dokumen sumbernya
sehingga bisa diperiksa. Format PDF, DOCX, XLSX, dan PPTX didukung — file yang
kemungkinan besar sudah ada di komputer Anda sekarang.

Satu hal yang perlu Anda tahu sejak awal: dokumen yang diunggah dikirim ke
layanan AI pihak ketiga untuk diindeks dan dijawab. Kami menyebutkannya terbuka
karena itu memengaruhi keputusan Anda soal dokumen mana yang layak diunggah, dan
karena kebanyakan vendor tidak menyebutkannya sama sekali. Rinciannya kami tulis
di [Kebijakan Privasi](/privacy).

Tapi kalau daftar tadi ternyata penuh pertanyaan yang belum ada dokumennya,
tidak ada alat yang bisa menolong. Yang Anda butuhkan adalah menulis dulu — dan
itu pekerjaan manusia.`,
};
