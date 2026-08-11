# Akun individu — catatan tertunda

Temuan MINOR dari review internal 11 Agustus 2026 atas fitur akun individu,
sengaja **belum diperbaiki**. Tidak ada yang berbahaya dibiarkan: tidak satu pun
menyentuh isolasi data, kuota, atau pembayaran.

Temuan MEDIUM dari review yang sama sudah diperbaiki dan tidak ada di daftar
ini: tab halaman harga yang melompat balik, jatah "5 Karyawan" yang tampil di
akun individu, pesan error salah untuk nama folder berisi spasi, dan tab yang
keliru saat `/api/admin/company` gagal.

## Yang bisa membingungkan pemakai

- **`src/app/chat/page.tsx`** — daftar folder hanya diambil sekali saat mount.
  Folder yang baru dibuat lewat dashboard tidak muncul di pemilih folder chat
  sampai halaman di-reload. Muncul saat seseorang mengatur dokumen dan bertanya
  di dua tab yang sama-sama terbuka.
- **`src/components/admin/DocumentsTab.tsx`** — upload ke folder B sementara
  filter sedang di folder A: baris baru tidak muncul di tabel (hanya angka di
  chip yang bertambah), sehingga upload terlihat seperti gagal.
- **`src/components/admin/DocumentsTab.tsx`** — tombol "Coba ulang file yang
  gagal" membaca isi field folder **saat itu**, bukan folder batch aslinya.
  Kalau field diubah di antara dua percobaan, file ulangan mendarat di folder
  lain.
- **`src/app/admin/page.tsx`** — polling daftar dokumen (tiap 3 detik, hanya
  selama ada dokumen di antrean indexing) mengganti seluruh array. Respons yang
  berangkat sebelum PATCH folder bisa mendarat sesudahnya dan membalik tampilan
  folder untuk satu siklus. Sembuh sendiri di poll berikutnya.

## Ketidakkonsistenan yang tidak terlihat pemakai

- **`src/app/api/folders/route.ts`** — `withTenant` tidak dibungkus try/catch,
  jadi database bermasalah menghasilkan 500, bukan 503 seperti yang dipakai
  `auth-guard` untuk kasus yang sama.
- **`src/components/admin/SubscriptionTab.tsx`** — tidak ada cabang warna untuk
  paket `personal`, jadi badge-nya polos tanpa ikon sementara header dashboard
  menampilkan "◆ Personal".
- **`src/app/chat/page.tsx`** — `/api/folders` dipanggil untuk semua pemakai
  termasuk akun perusahaan, yang selalu menerima daftar kosong. Satu request
  terautentikasi terbuang setiap kali chat dibuka.
- **`src/components/admin/DocumentsTab.tsx`** — chip "Tanpa folder" memakai
  `key={key ?? "__all__"}`; `""` lolos dari `??`, jadi key-nya string kosong.
  Sah di React, tapi rapuh kalau daftar chip berubah.

## Dari audit keamanan 11 Agustus 2026

Audit menemukan 0 CRITICAL dan 0 MEDIUM. Tiga temuan MINOR sudah diperbaiki
(daftar field eksplisit di `/api/admin/company`, folder tak terpakai ditolak
alih-alih diabaikan, rate limit proxy untuk endpoint baru). Yang tersisa:

- **`src/app/api/admin/documents/[id]/route.ts`** — parameter `id` tidak dicek
  bentuknya (bukan UUID). Tidak bisa di-inject: nilainya masuk query drizzle
  terparameter dan dibatasi `companyId` + RLS, jadi id sembarang berakhir 404.
- **`src/app/api/admin/upload/route.ts`** dan **`.../documents/[id]/route.ts`**
  — admin perusahaan bisa mengubah `department` sebuah dokumen (termasuk
  melepasnya jadi `null`, yang membuat dokumen khusus-HR terlihat semua
  karyawan) tanpa UI dan tanpa jejak audit. Bukan eskalasi hak — admin memang
  sudah bisa membaca dan menghapus semua dokumen — tapi diam. Tidak ada audit
  log aksi admin di aplikasi ini; itu keputusan yang sudah diambil, bukan
  kelalaian.
- **`src/app/api/auth/register-admin/route.ts`** — nama asli pemakai individu
  kini tersimpan di `companies.name`, jadi PII yang sama ada di dua tabel.
  Hanya terbaca pemiliknya sendiri, dan tidak pernah dikirim ke Midtrans
  maupun email. Perlu diingat kalau ada permintaan penghapusan data. Efek
  sampingnya: individu bisa memakai nama yang identik dengan perusahaan
  terdaftar (index uniknya parsial). Hari ini tanpa akibat karena nama
  workspace tidak pernah ditampilkan ke tenant lain — tinjau ulang kalau nanti
  ada fitur yang menampilkan atau mencocokkan nama itu.

## Dari review tab Individu/Perusahaan di landing page (11 Agustus 2026)

Satu temuan MEDIUM sudah diperbaiki: navbar dan footer tadinya tidak membawa
pilihan tab ke `/register`, padahal jenis akun permanen. Dua MINOR ikut
diperbaiki (identitas panel FAQ kini per-audiens; link Kalkulator ROI
disembunyikan di tab individu). Yang tersisa:

- **`src/components/LandingContent.tsx`** — kartu Personal di teaser harga
  menyimpan `price: ""` karena harganya diambil dari `getPlanPrice("personal")`
  lewat pencocokan nama kartu. Kartu perusahaan menyimpan literal
  (`"Rp 200rb/bln"`) sebagai cadangan; punya individu kosong. Nama kartu yang
  diubah atau diterjemahkan menghasilkan kartu tanpa harga, bukan harga basi.
- **`src/components/LandingContent.tsx`** — angka dari `PLAN_LIMITS` disisipkan
  mentah ke copy individu (`${PLAN_LIMITS.personal.maxDocuments} dokumen`).
  `src/lib/i18n.ts` punya helper `idLimit`/`enLimit` justru supaya `-1` tidak
  pernah tercetak sebagai angka, tapi helper itu module-private. Hari ini aman —
  satu-satunya nilai `-1` (kuota bulanan Personal) ditulis sebagai kata — tapi
  batas yang diubah ke `-1` nanti akan berbunyi "-1 dokumen".
- **`src/app/pricing/page.tsx`** — pengguna perusahaan yang sudah login dan
  membuka `?type=individual` melihat kartu individu sekejap sebelum efek session
  menimpanya ke perusahaan. Akhirnya benar; jendelanya satu round-trip setelah
  hidrasi.
- **`src/components/LandingContent.tsx`** — `calculateRoi` tetap dihitung setiap
  render walau section ROI disembunyikan untuk individu. Aritmetika murni, biaya
  sepele, tapi kerja mati.
- **`src/app/page.tsx`** — judul dan deskripsi halaman tetap versi perusahaan
  untuk pengunjung individu. Ini **disengaja**: metadata dirender di server dan
  tabnya state klien, jadi HTML yang diindeks harus tetap yang sudah dikenal
  Google. Konsekuensinya tab browser pengunjung individu berbunyi salah.
- **`src/components/LandingContent.tsx`** — berpindah tab tidak mengatur ulang
  posisi scroll. Dari tab perusahaan dua section hilang, jadi viewport bisa
  mendarat di konten yang tidak berhubungan. Tab-nya sendiri ada di puncak
  halaman, jadi kebanyakan orang berpindah saat masih di atas.

## Sudah rusak sebelum fitur ini (bukan regresi)

- **`src/components/admin/OnboardingBanner.tsx`** — tombol langkah pertama
  memanggil `document.querySelector('[data-value="documents"]')`. Radix Tabs
  tidak pernah merender atribut `data-value` (dicek di
  `node_modules/@radix-ui/react-tabs`: nol kemunculan), jadi tombol itu tidak
  melakukan apa-apa. Sekarang jalur mati yang sama juga dipakai akun individu.
- **`src/app/api/auth/register-admin/route.ts`** — cek nama perusahaan unik
  masih read-then-write, jadi dua pendaftaran serentak dengan nama sama
  menghasilkan pelanggaran unik (23505) yang tidak ditangani → 500. Index
  parsial baru di migrasi 0016 mempertahankan bentuk yang persis sama.
