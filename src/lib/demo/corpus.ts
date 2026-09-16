// Authored exclusively for the public demo. Never import customer documents here.
export const DEMO_COMPANY_ID = "intellibase-public-demo-rs-sehat-v1";
export const DEMO_LABEL = "Contoh fiktif – RS Demo Sehat";
export const DEMO_DOCUMENTS = [
  {
    slug: "transfusi",
    title: "SPO Observasi Transfusi — Simulasi",
    body: `Tujuan: memperagakan pencarian jadwal observasi dalam dokumen, bukan memberikan instruksi pelayanan pasien.

Dalam skenario pelatihan RS Demo Sehat, observasi setelah transfusi selesai berlangsung 30 menit. Angka ini hanya aturan skenario fiktif, bukan rekomendasi klinis. Perawat simulasi mencatat waktu selesai transfusi, waktu akhir observasi, dan nama petugas pada Formulir DEMO-TRF.

Bila peserta simulasi melaporkan keluhan, petugas menghubungi dokter jaga simulasi dan mencatat keluhan pada formulir yang sama. Dokumen demo ini tidak memuat tata laksana reaksi transfusi, kriteria transfusi, atau dosis. Pada pelayanan nyata gunakan SPO resmi fasilitas dan penilaian tenaga kesehatan yang berwenang.`,
  },
  {
    slug: "code-blue",
    title: "Panduan Code Blue — Simulasi",
    body: `Tujuan: latihan koordinasi tim menggunakan skenario fiktif tanpa pasien.

Saat code blue dalam simulasi RS Demo Sehat, hubungi operator simulasi melalui ekstensi 777. Sebutkan "Code Blue simulasi", gedung, lantai, ruangan, dan nama pelapor. Ekstensi 777 adalah nomor rekaan dalam dataset, bukan nomor darurat yang dapat dihubungi.

Operator meneruskan panggilan kepada tim Code Blue simulasi: dokter jaga sebagai koordinator, perawat terlatih sebagai petugas pendamping, dan petugas keamanan sebagai pengarah akses. Pencatat mengisi Formulir DEMO-CB dengan waktu panggilan, lokasi, waktu kedatangan tim, dan hasil evaluasi latihan.

Dokumen ini tidak mengajarkan resusitasi, pemberian obat, atau tindakan kegawatdaruratan. Untuk kejadian nyata ikuti sistem darurat resmi fasilitas setempat.`,
  },
  {
    slug: "high-alert",
    title: "SPO Pengelolaan Obat High Alert — Simulasi",
    body: `Tujuan: latihan dokumentasi obat high alert menggunakan kemasan tiruan tanpa obat aktif.

Dalam skenario RS Demo Sehat, sebelum penyerahan obat high alert simulasi, dua petugas melakukan pemeriksaan independen. Petugas pertama membaca label latihan dan mencocokkannya dengan lembar instruksi simulasi. Petugas kedua melakukan pemeriksaan sendiri, lalu keduanya membandingkan hasil dan membubuhkan paraf pada Formulir DEMO-HA.

Kemasan tiruan diberi label merah "HIGH ALERT — SIMULASI" dan disimpan di rak latihan terpisah. Bila label atau instruksi tidak cocok, proses latihan dihentikan untuk klarifikasi kepada apoteker simulasi.

Dokumen ini tidak memuat nama obat, dosis, konsentrasi, pengenceran, atau cara pemberian obat kepada pasien.`,
  },
  {
    slug: "pasien-jatuh",
    title: "SPO Pelaporan Pasien Jatuh — Simulasi",
    body: `Tujuan: melatih alur pelaporan insiden melalui manekin, tanpa pasien nyata.

Dalam simulasi RS Demo Sehat, petugas yang menemukan skenario pasien jatuh menghubungi perawat penanggung jawab dan dokter jaga simulasi. Penanggung jawab ruangan mengoordinasikan pencatatan dan memastikan peserta latihan tidak mengubah catatan kejadian.

Formulir DEMO-JATUH mencatat waktu, lokasi, deskripsi kejadian yang diamati, nama pelapor, serta petugas yang dihubungi. Penanggung jawab ruangan menyerahkan laporan latihan kepada tim mutu simulasi sebelum sesi latihan berakhir. Evaluasi membahas komunikasi dan kelengkapan laporan, bukan menyalahkan peserta.

Dokumen ini tidak memuat cara memindahkan pasien, pemeriksaan cedera, atau terapi.`,
  },
  {
    slug: "pathway-sc",
    title: "Clinical Pathway Sectio Caesarea — Administrasi Simulasi",
    body: `Tujuan: mendemonstrasikan penelusuran tanggung jawab administrasi clinical pathway, bukan panduan operasi.

Pada skenario sectio caesarea RS Demo Sehat, koordinator ruangan memeriksa kelengkapan lembar pathway simulasi, daftar periksa dokumen, dan catatan edukasi. Dokter simulasi mengisi bagian evaluasi medis latihan, perawat simulasi mengisi catatan koordinasi, dan petugas administrasi memeriksa identitas rekaan pada berkas.

Bila ada kolom kosong, koordinator ruangan mengembalikan lembar kepada petugas yang bertanggung jawab sebelum berkas latihan ditutup. Petugas administrasi menyimpan berkas di folder "Latihan SC", terpisah dari berkas pelayanan nyata.

Dokumen ini tidak memuat indikasi operasi, anestesi, antibiotik, lama rawat, atau kriteria pulang.`,
  },
  {
    slug: "formularium",
    title: "Formularium Ringkas — Tata Kelola Simulasi",
    body: `Tujuan: menunjukkan alur pencarian dan pembaruan daftar obat rekaan; tidak berisi obat untuk diresepkan.

Formularium latihan RS Demo Sehat memakai kode DEMO-A dan DEMO-B sebagai pengganti nama obat. Kedua kode tidak mewakili obat nyata. Daftar latihan disimpan oleh apoteker simulasi di folder "Formularium Demo".

Usulan pembaruan formularium dikirim kepada apoteker simulasi menggunakan Formulir DEMO-FOR. Isinya adalah kode item latihan, alasan perubahan, nama pengusul, dan tanggal usulan. Komite farmasi simulasi meninjau usulan dan mencatat keputusan pada log revisi. Hanya versi yang diberi status "Aktif untuk latihan" digunakan dalam sesi demo.

Dokumen ini tidak memuat dosis, interaksi obat, substitusi, harga, atau rekomendasi pengobatan.`,
  },
] as const;

export function demoDocumentId(slug: string) { return `${DEMO_COMPANY_ID}:${slug}`; }
export function demoDocumentName(title: string) { return `${title} | ${DEMO_LABEL}`; }
export function demoDocumentText(doc: typeof DEMO_DOCUMENTS[number]) {
  return `${DEMO_LABEL}\n${doc.title}\nHanya untuk demonstrasi produk, bukan panduan klinis.\n\n${doc.body}`;
}
