# Blog — catatan tertunda

Temuan MINOR dari review internal 9 Agustus 2026, sengaja **belum diperbaiki**.
Tidak ada yang berbahaya dibiarkan; semuanya soal kerapian atau kasus yang belum
bisa terjadi dengan tiga artikel yang ada sekarang.

Temuan MEDIUM dari review yang sama (tanggal rusak menggagalkan build, slug
kembar tidak terdeteksi, link anchor membuka tab baru) sudah diperbaiki dan
tidak ada di daftar ini.

## Komentar yang sudah tidak akurat

- **`src/lib/blog.ts`** — komentar pada field `body` menyebut file
  `src/components/blog/Markdown.tsx`. File itu tidak pernah ada; namanya
  `ArticleBody.tsx`.
- **`src/lib/blog.ts`** — komentar pada `readingMinutes` menyebut artikel
  "dengan tabel dan daftar". Tidak ada tabel di artikel mana pun, dan memang
  tidak boleh ada: `remark-gfm` tidak terpasang, jadi sintaks tabel akan tampil
  sebagai garis pipa mentah. Bertentangan dengan komentar di
  `ArticleBody.tsx` yang menjelaskan hal ini dengan benar.
- **`src/app/sitemap.ts`** — komentar `lastModified` masih menyebut "all six
  URLs"; sekarang ada 10. Kalimatnya juga menjadi janggal setelah blok artikel
  disisipkan di atasnya.

## Kerapian kode

- **`src/app/blog/[slug]/page.tsx`** — `generateMetadata` mengembalikan `{}`
  kalau post tidak ditemukan. Itu kode mati selama `dynamicParams = false`.
  Kalau flag itu suatu saat dibalik, halamannya akan mewarisi judul
  "IntelliBase AI" tanpa deskripsi, bukan metadata 404 yang benar.

- **`src/components/blog/ArticleBody.tsx`** — override `code` ditulis untuk kode
  inline, dan `pre` tidak di-override sama sekali. Blok kode berpagar (```)
  akan tampil sebagai pil inline di dalam `<pre>` polos. Belum ada artikel yang
  memakai blok kode; perbaiki saat artikel pertama yang butuh itu ditulis.

- **`src/app/blog/[slug]/page.tsx`** — `relatedHref` dan `relatedLabel` adalah
  dua field opsional terpisah, dan blok "baca juga" hanya render kalau keduanya
  terisi. Mengisi salah satu saja membuatnya hilang diam-diam. Lebih baik satu
  objek opsional (`related?: { href: string; label: string }`) supaya tipe yang
  memaksa keduanya berpasangan.

- **`src/app/blog/page.tsx`** — `POSTS` kosong akan merender `<ul>` bergaris
  tanpa isi, tanpa empty state. Tidak bisa terjadi sekarang (array-nya konstan
  saat kompilasi); baru relevan kalau artikel suatu saat datang dari basis data
  atau CMS.

## Kalau menambah artikel baru

Bukan temuan, tapi ini yang paling mudah terlupa:

1. Buat `src/content/blog/<slug>.ts`, lalu **impor dan masukkan ke `ALL_POSTS`**
   di `src/lib/blog.ts`. Tanpa langkah kedua, artikelnya tidak ada.
2. `publishedAt` harus persis `YYYY-MM-DD`. Timestamp ISO lengkap akan
   menggagalkan build — sekarang dengan pesan yang menyebut slug-nya.
3. Jangan pakai tabel markdown (lihat alasannya di atas).
4. Jalankan pemeriksa klaim sebelum commit. Linter-nya membaca `.md`/`.json`,
   sedangkan artikel berupa `.ts`, jadi isinya perlu diekstrak dulu —
   lihat `scripts/content/lint.mjs` dan `scripts/content/brand-facts.mjs` untuk
   daftar klaim yang dilarang.
