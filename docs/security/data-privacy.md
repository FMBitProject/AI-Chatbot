# Kontrol privasi dokumen

## Cakupan rilis

Implementasi tahap 1–5: pemetaan aliran data, izin provider per workspace,
klasifikasi dokumen, penghapusan indeks dan invalidasi konteks chat, serta audit
metadata dan tes. Ini tidak menghapus request yang sudah diterima provider,
riwayat yang sudah tampil di browser/Slack, atau salinan database dalam backup.

## Aliran data yang ditemukan

| Jalur | Data keluar | Tujuan / kontrol |
| --- | --- | --- |
| Upload lokal | Tidak ada panggilan AI selama ekstraksi | Teks tersimpan di `documents.raw_text` |
| Impor Drive | Token akses sementara dan ID file ke Google Drive | Unduh file; klasifikasi diterapkan sebelum queue AI. Menonaktifkan AI Google tidak menonaktifkan koneksi Drive |
| Indexing | Teks setiap chunk | Gemini `gemini-embedding-001`; izin Google dan klasifikasi diperiksa pada setiap request/batch/retry |
| Ringkasan | Nama dan bagian awal dokumen (maks. 2.000 karakter teks) | Rantai model; izin provider berlaku pada fallback |
| Pencarian | Pertanyaan pengguna | Gemini embedding |
| Chat | Pertanyaan, konteks chat yang masih berlaku, judul katalog, kutipan hasil retrieval | Provider jawaban yang diizinkan |
| Saran lanjutan | Pertanyaan dan bagian awal jawaban | Provider yang menjawab; diperiksa lagi |
| API dan kedua jalur Slack | Pertanyaan dan kutipan hasil retrieval | Kebijakan yang sama; tanpa riwayat chat web |
| Tes koneksi provider | Prompt sintetis | Tetap mematuhi izin provider |
| Demo publik / seed demo | Korpus fiktif versi aplikasi | Terpisah dari workspace pelanggan; bukan bukti bahwa akun provider privat |

`scripts/backfill-rag.mjs` dinonaktifkan karena melewati kontrol tenant dan
provider. Gunakan `npm run rag:reindex -- <company-id>` (dry run) dan proses
indexing saat ini; dokumen tanpa teks sumber perlu diunggah ulang.

`privacyFetch` memeriksa ulang kebijakan pada batas transport SDK, sehingga
retry SDK dan fallback tidak hanya mengandalkan konfigurasi saat request masuk.
Ketika kebijakan tidak bisa dibaca atau audit tidak bisa disimpan, request baru
ke provider ditolak. Event `provider_attempt` berarti percobaan yang diizinkan,
bukan bukti request diterima atau dihapus oleh provider.

## Pengaturan admin

Di tab langganan, kartu **Privasi data** menentukan provider yang diizinkan.
Aturan ini berlaku pada mode platform maupun BYOK dan tersedia tanpa paywall.
Izin tidak menambahkan provider ke rantai jawaban; ia hanya menyaring rantai
platform atau pilihan BYOK yang sudah dikonfigurasi. Google diperlukan untuk
embedding saat ini. Tanpa Google, pencarian dan jawaban RAG berhenti; tidak ada
peralihan embedding diam-diam ke model lain.

Untuk kompatibilitas, workspace tanpa pengaturan eksplisit tetap mengizinkan
provider yang didukung. Migrasi tidak diam-diam mematikan layanan yang aktif.
Admin harus memilih daftar yang disetujui. Daftar kosong menghentikan seluruh
pemrosesan AI eksternal workspace. Ini bukan pengaturan ZDR atau persetujuan
kontrak pada akun provider.

Klasifikasi saat upload/impor atau melalui daftar dokumen:

- **Biasa / Internal:** dapat diproses oleh provider yang diizinkan.
- **Rahasia:** teks disimpan dengan status `blocked`, tanpa indexing atau
  ringkasan eksternal. Retrieval dan katalog AI mengecualikannya, termasuk jika
  ada indeks lama yang tidak semestinya tertinggal.

Mengubah klasifikasi menghapus indeks dan ringkasan sebelumnya, membatalkan lease
indexing, lalu mengantrekan kembali hanya dokumen nonrahasia yang memiliki teks.
Menandai dokumen yang sudah pernah dikirim sebagai rahasia tidak menarik kembali
pengiriman yang sudah terjadi.

## Penghapusan dan riwayat

DELETE dokumen menjalankan satu transaksi tenant: hapus dokumen (FK cascade
menghapus `document_chunks` dan `document_index_chunks`), naikkan revisi privasi,
lalu simpan event penghapusan. Gagal mencatat revisi/audit membatalkan transaksi.
ID milik tenant lain atau ID yang tidak ditemukan menghasilkan 404.

Setiap pesan baru menyimpan revisi konteks yang digunakan. Chat hanya membaca
pesan dengan revisi workspace saat ini. Penghapusan, perubahan klasifikasi, dan
penyimpanan kebijakan mengecualikan **seluruh** riwayat sebelumnya dari konteks
AI, bukan hanya jawaban yang memiliki citation. Ini mencakup riwayat legacy yang
sumbernya tidak lengkap, pertanyaan pengguna yang mengutip jawaban sebelumnya,
dan jawaban dari request lama yang selesai setelah penghapusan.

Riwayat tetap dapat dibaca dan bukan berarti dihapus secara fisik. Tidak ada
pembersihan otomatis backup, ekspor, pesan Slack, atau log yang sudah terlanjur
ada. Pengguna masih dapat mengetik/menempel ulang informasi secara manual;
klasifikasi dokumen bukan detektor DLP terhadap isi pertanyaan.

Request yang sudah lolos pemeriksaan pengiriman atau sedang berjalan dapat
selesai; pemeriksaan dan jaringan bukan satu transaksi atomik. Tombol hapus
mengonfirmasi penghapusan database dan invalidasi konteks, bukan pencabutan
request provider. Worker lama tidak dapat menerbitkan kembali dokumen yang
terhapus/berubah lease. Retry, batch berikutnya, fallback, dan saran lanjutan
memeriksa revisi kembali sebelum mengirim.

Audit menyimpan waktu, workspace, revisi, tindakan, provider, tujuan, dan ID
sumber yang diketahui, tanpa isi SOP, judul, pertanyaan, jawaban atau key. ID
sumber riwayat legacy dapat tidak lengkap. Kartu admin menampilkan 50 event
terakhir. Event belum memiliki kebijakan penghapusan otomatis; pertumbuhan tabel
perlu dimonitor dan periode retensinya ditentukan operasional.

## Penerapan

1. Jalankan tes lokal. Tes menggunakan PostgreSQL sementara (PGlite) dan HTTP
   palsu, tanpa database produksi atau request AI nyata.
2. Terapkan `0025_privacy_controls.sql` lewat mekanisme migrasi normal **sebelum**
   kode baru. Migrasi hanya menambah tabel/kolom/default/constraint dan RLS; kode
   lama tetap dapat berjalan. Fitur baru belum terlindungi selama kode lama
   masih melayani, jadi jangan mengaktifkan kebijakan baru sebelum rollout selesai.
3. Deploy kode baru dan pastikan semua worker memakai versi yang sama. Untuk
   dokumen sangat sensitif, hentikan ingress/indexing lama selama pergantian.
4. Admin memilih provider yang diizinkan dan menandai dokumen rahasia. Kebijakan
   default tidak membuktikan bahwa billing/retensi provider telah diverifikasi.
5. Smoke test dengan dokumen sintetis: upload biasa/rahasia, chat, disable provider,
   hapus sumber, dan lanjutkan chat lama. Jangan memakai SOP rahasia untuk tes.

Rollback aplikasi harus mempertimbangkan bahwa versi lama tidak menegakkan
kebijakan baru. Jangan rollback ke versi lama dengan traffic sensitif masih
aktif. Jangan drop tabel audit atau kolom klasifikasi untuk rollback rutin.

Migrasi produksi, deployment, serta verifikasi dashboard billing/retensi belum
dijalankan oleh pekerjaan implementasi ini. Tidak ada akses dashboard provider
yang dipakai untuk menyatakan akun sudah ZDR atau Paid Services.

Rujukan operasional yang perlu diverifikasi oleh pemilik akun:
[Gemini API terms](https://ai.google.dev/gemini-api/terms),
[Gemini retention](https://ai.google.dev/gemini-api/docs/zdr),
[Groq data controls](https://console.groq.com/docs/your-data).
Catat project/organisasi yang memakai key platform dan BYOK secara terpisah;
status satu akun tidak membuktikan status akun lainnya.

## Tahap 6: evaluasi pemrosesan privat

Jalur ini belum diaktifkan karena belum ada target infrastruktur atau kapasitas
yang disepakati. Evaluasi dapat dilakukan dengan data sintetis:

1. Sediakan layanan embedding dan model di infrastruktur perusahaan dengan
   akses jaringan terbatas. Hilangkan fallback ke API publik; periksa logging
   layanan, telemetry, backup, dan akses operator juga.
2. Pilih kandidat berdasarkan bahasa SOP, panjang dokumen, concurrency, latensi,
   dan budget server. Jalankan benchmark retrieval/grounding pada pertanyaan
   berjawaban dan pertanyaan yang harus ditolak; ukur RAM/VRAM serta biaya nyata.
3. Buat indeks baru yang mencatat model/dimensi/versi. Re-index semua dokumen di
   lingkungan privat. Jangan campurkan vektor baru dengan indeks Gemini lama.
4. Bandingkan kualitas, lalu pindahkan query embedding dan generation bersama
   ke jalur privat. Jika embedding berbeda dimensinya, siapkan migrasi indeks
   terpisah dan cutover yang atomik.
5. Uji bahwa tidak ada egress API publik ketika semua jalur dipakai, termasuk
   upload, ringkasan, retry, saran, API dan Slack. Slack sendiri tetap merupakan
   layanan eksternal sehingga persyaratan tanpa egress mungkin mengharuskan
   integrasi tersebut dimatikan.

Jangan mengklaim “data tidak keluar dari infrastruktur perusahaan” sebelum
seluruh jalur dan layanan pendukung tersebut diverifikasi.
