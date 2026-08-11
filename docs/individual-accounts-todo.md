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
