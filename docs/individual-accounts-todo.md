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

- **`src/app/api/chat/route.ts`** dan **`src/app/api/admin/upload/route.ts`** —
  nama folder di atas 100 karakter diam-diam menjadi `null` (chat: cari semua
  dokumen; upload: simpan tanpa folder), sementara `PATCH
  /api/admin/documents/[id]` menolaknya dengan 400. UI tidak bisa menghasilkan
  input itu (field-nya di-cap 100), dan `null` hanya melebar ke hak akses
  normal pemakai itu sendiri — bukan celah akses.
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
