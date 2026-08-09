import type { BlogPost } from "@/lib/blog";

export const apaItuRag: BlogPost = {
  slug: "apa-itu-rag-dan-bedanya-dengan-chatgpt",
  title: "Apa Itu RAG, dan Bedanya dengan Menempel Dokumen ke ChatGPT",
  metaTitle: "Apa Itu RAG dan Bedanya dengan ChatGPT",
  description:
    "Penjelasan RAG (Retrieval-Augmented Generation) tanpa jargon: cara kerjanya, kenapa berbeda dari menempel dokumen ke chatbot biasa, dan di mana batasnya.",
  excerpt:
    "Istilah yang dipakai hampir semua vendor AI, dijelaskan sampai ke bagian yang menentukan apakah jawabannya bisa dipercaya.",
  publishedAt: "2026-08-07",
  readingMinutes: 8,
  body: `Kalau Anda sedang menimbang alat AI untuk dokumen internal perusahaan, kata
"RAG" pasti muncul. Hampir semua vendor menyebutnya, jarang ada yang
menjelaskannya, dan bagi calon pembeli istilah itu berubah menjadi kata sakti
yang tidak bisa dinilai.

Artikel ini menjelaskannya dalam bahasa biasa — termasuk bagian yang biasanya
tidak disebutkan dalam presentasi penjualan.

## Masalah yang RAG selesaikan

Model bahasa seperti GPT, Gemini, atau Claude dilatih dari teks publik dalam
jumlah sangat besar. Model-model itu tidak pernah melihat SOP perusahaan Anda,
kebijakan cuti Anda, atau formularium obat rumah sakit Anda.

Kalau Anda bertanya soal kebijakan internal ke chatbot umum, ia tetap akan
menjawab. Jawabannya terdengar meyakinkan dan bisa saja seluruhnya salah, karena
model tersebut menyusun jawaban dari pola bahasa, bukan dari dokumen Anda.

RAG — *Retrieval-Augmented Generation*, "pembangkitan yang diperkuat pengambilan"
— adalah cara mengatasi itu. Idenya sederhana: **cari dulu bagian dokumen yang
relevan, baru minta model menjawab hanya berdasarkan bagian itu.**

## Cara kerjanya, langkah demi langkah

### 1. Dokumen dipotong menjadi bagian-bagian kecil

Satu SOP 40 halaman terlalu besar untuk diproses sekaligus, dan sebagian besar
isinya tidak relevan dengan pertanyaan mana pun. Jadi dokumen dipecah menjadi
potongan-potongan — biasanya sepanjang beberapa paragraf.

Di mana potongan itu dipotong ternyata sangat menentukan. Potongan yang terputus
di tengah kalimat atau memisahkan judul dari isinya menghasilkan jawaban yang
kehilangan konteks.

### 2. Tiap potongan diubah menjadi angka

Tiap potongan diproses menjadi deretan angka yang disebut *embedding*, yang
mewakili maknanya. Ini bagian yang paling sulit dibayangkan, tapi konsekuensinya
mudah: potongan yang membahas hal serupa akan punya deretan angka yang
berdekatan — meskipun kata-katanya sama sekali berbeda.

Karena itulah pertanyaan "berapa lama cuti melahirkan?" bisa menemukan paragraf
yang tidak pernah menyebut kata "cuti melahirkan", melainkan "istirahat sebelum
dan sesudah persalinan".

Ini perbedaan mendasar dari pencarian kata kunci di share drive, yang hanya bisa
mencocokkan kata yang persis sama.

### 3. Pertanyaan dicari padanannya

Saat staf bertanya, pertanyaannya diubah menjadi deretan angka dengan cara yang
sama, lalu sistem mencari potongan dokumen yang angkanya paling berdekatan.
Hasilnya: beberapa potongan yang paling mungkin memuat jawaban.

### 4. Model menjawab, dengan potongan itu di depannya

Barulah model bahasa dipanggil. Ia menerima pertanyaan staf **beserta**
potongan-potongan tadi, dengan instruksi menjawab hanya berdasarkan bahan itu.

Di sinilah sitasi lahir. Karena sistem tahu persis potongan mana yang dipakai, ia
bisa menunjukkan dokumen asalnya. Pembaca tidak perlu percaya begitu saja — ia
bisa membuka sumbernya.

## Kenapa bukan sekadar menempel dokumen ke ChatGPT

Pertanyaan yang wajar: jendela konteks model sekarang sudah besar, kenapa tidak
tempel saja semua dokumen setiap kali bertanya?

Untuk dua atau tiga dokumen, itu memang bekerja, dan Anda tidak butuh sistem apa
pun. Yang berubah pada skala perusahaan:

- **Biaya.** Anda membayar per teks yang diproses. Mengirim ulang seluruh
  dokumen untuk setiap pertanyaan berarti membayar ulang seluruh isinya, setiap
  kali, untuk setiap orang.
- **Batas ukuran.** Ratusan dokumen tetap tidak muat, seberapa pun besar jendela
  konteksnya.
- **Ketelitian menurun.** Semakin banyak teks yang tidak relevan disodorkan,
  semakin sering model mengambil bagian yang salah.
- **Tidak ada sitasi.** Kalau semuanya ditempel, tidak ada cara mengetahui
  bagian mana yang sebenarnya dipakai untuk menjawab.
- **Tidak ada pembatasan akses.** Menempel manual berarti setiap penanya melihat
  apa pun yang ditempelkan.
- **Dokumen basi.** Salinan tempelan tidak ikut berubah saat dokumen aslinya
  direvisi.

## Kenapa bukan melatih ulang model

Pertanyaan yang juga sering muncul: bukankah lebih baik "melatih AI dengan
dokumen kami"?

Untuk kasus ini, hampir selalu tidak. Melatih ulang (*fine-tuning*) mengajarkan
model sebuah gaya atau format, bukan cara mengingat fakta secara andal. Model
hasil pelatihan ulang tetap bisa mengarang, tidak bisa menunjukkan sumber, dan
harus dilatih ulang setiap kali ada satu SOP direvisi. RAG hanya perlu mengganti
satu dokumen.

## Ke mana dokumen Anda pergi

Bagian ini jarang ada di halaman produk, padahal justru ini yang menentukan
dokumen mana yang layak Anda unggah.

RAG memerlukan dua layanan AI: satu untuk mengubah dokumen menjadi embedding, dan
satu lagi untuk menyusun jawaban. Pada IntelliBase, dokumen diindeks lewat Google
Gemini dan jawaban disusun lewat Groq. Artinya isi dokumen Anda memang melewati
layanan pihak ketiga.

Hampir semua produk sejenis bekerja begitu — perbedaannya hanya pada apakah hal
itu disebutkan. Kami menyebutkannya, dan menuliskannya di
[Kebijakan Privasi](/privacy), karena Anda berhak memutuskan sendiri dokumen mana
yang boleh keluar.

Yang bisa dipisahkan adalah data antar perusahaan di sistem kami. Pemisahan itu
ditegakkan di level basis data lewat Row Level Security PostgreSQL, dan sudah
kami verifikasi lewat pengujian.

## Batas yang perlu Anda tahu

RAG mengurangi karangan, tapi tidak menghapusnya. Beberapa hal yang jujur untuk
diketahui sebelum memutuskan:

- **Kalau dokumennya salah, jawabannya salah.** Sistem ini setia pada dokumen
  Anda, termasuk saat dokumen Anda keliru atau kedaluwarsa.
- **Kalau jawabannya tidak ada di dokumen mana pun**, sistem yang baik akan
  bilang tidak tahu — dan itu perilaku yang benar, meski terasa mengecewakan.
- **Hasil pindaian tanpa teks tidak terbaca.** PDF yang isinya foto halaman perlu
  OCR lebih dulu.
- **Tabel dan formulir kompleks sering kacau** saat dipotong, karena strukturnya
  hilang ketika diubah menjadi teks biasa.
- **Sitasi harus Anda periksa.** Sitasi memberi Anda kemampuan memeriksa; itu
  tidak sama dengan kepastian bahwa jawabannya benar.

## Tiga pertanyaan untuk vendor mana pun

Kalau Anda sedang membandingkan beberapa produk, tiga pertanyaan ini paling cepat
memisahkan yang serius dari yang tidak:

1. **Setiap jawaban menunjukkan sumbernya atau tidak?** Kalau tidak, Anda tidak
   punya cara memeriksa apa pun.
2. **Ke mana dokumen kami dikirim?** Vendor yang menjawab "tidak ke mana-mana"
   entah sedang salah, atau sedang tidak berterus terang.
3. **Bagaimana data antar perusahaan dipisahkan, dan bagaimana itu dibuktikan?**
   Jawaban yang layak menyebut mekanisme teknisnya, bukan sekadar kata "aman".

Kalau Anda ingin melihat bentuknya secara langsung, [paket gratisnya](/pricing)
cukup untuk menguji dengan dokumen Anda sendiri tanpa kartu kredit.`,
};
