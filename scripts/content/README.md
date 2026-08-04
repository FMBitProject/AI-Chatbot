# Otomasi konten media sosial

Claude menulis paket konten mingguan — **Senin–Minggu, 1 post per hari, untuk
LinkedIn + YouTube + Instagram = 21 item/minggu**, tayang **16.15 WIB**. Post
LinkedIn dikirim otomatis ke Buffer sebagai **draft** untuk Anda approve.

Cadence dan jamnya ada di `schedule.mjs` — ubah di situ saja, semua file lain
membaca bentuknya dari sana.

> **Perhatikan beban produksinya.** Tulisannya otomatis, medianya tidak: 7 video
> Shorts + 7 gambar Instagram per minggu tetap Anda buat sendiri (lihat bagian di
> bawah). Kalau itu terlalu berat, jalankan `--only linkedin` di hari-hari sibuk.

## Setup (sekali)

1. Isi `BUFFER_API_KEY` di `.env.local` — <https://publish.buffer.com/settings/api>
   (harus owner organisasi Buffer; paket gratis dapat 1 key, dan API-nya **tidak
   butuh billing**).
2. `npm run content:channels` → salin ID channel LinkedIn ke
   `BUFFER_LINKEDIN_CHANNEL_ID` di `.env.local`.

Model penulisnya **default ke Gemini free tier**, memakai
`GOOGLE_GENERATIVE_AI_API_KEY` yang sudah ada di project. Gratis, dan aman di sini
karena script ini hanya memproses materi marketing kita sendiri — bukan dokumen
pelanggan, jadi pertimbangan free-tier yang berlaku di produk tidak berlaku di sini.

Mau pindah ke Claude (berbayar, instruction-following lebih ketat)? Di `.env.local`:

```
CONTENT_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

`npm run content:models` menampilkan model Gemini yang valid untuk key Anda;
`CONTENT_MODEL=<id>` untuk memaksa salah satunya.

## Alur mingguan

```bash
npm run content:generate     # tulis paket untuk Senin minggu depan
                             # -> content/packs/<senin>.md  <- baca ini
npm run content:push         # kirim 7 post LinkedIn ke Buffer sebagai draft
```

Lalu buka <https://publish.buffer.com/drafts>, baca, approve.

Opsi lain:

```bash
npm run content:generate -- --week 2026-08-17 --topic "biaya salah jawab HR"
npm run content:push -- --dry-run     # lihat isinya tanpa kirim
npm run content:lint content/packs/2026-08-10.json
```

## Kenapa YouTube & Instagram tidak ikut dikirim

Buffer **tidak punya endpoint upload media**. Gambar/video harus sudah berada di
URL publik yang tetap bisa diakses sampai post terbit
([dokumentasi](https://developers.buffer.com/guides/hosting-media.html)).
Instagram tidak menerima post tanpa gambar, dan YouTube jelas butuh file video.

Jadi untuk dua platform itu Claude menulis semuanya — skrip, judul, deskripsi,
caption, plus catatan apa yang perlu direkam/difoto — dan hasilnya menunggu di
file `.md`. Anda tinggal bikin medianya lalu tempel.

Kalau nanti Instagram mau 100% otomatis: perlu generator gambar (kartu kutipan)
+ hosting (Cloudflare R2 / Cloudinary), lalu `assets` di `push-buffer.mjs` diisi
URL-nya.

## Kenapa draft, bukan langsung terjadwal

Ini copy buatan AI yang masuk ke akun founder pribadi. `lint.mjs` sudah menolak
klaim terlarang secara mekanis, tapi ia hanya menangkap pola yang sudah kita
kenal. Halaman depan pernah harus ditarik ulang gara-gara klaim yang tidak bisa
dibuktikan — mata manusia tetap jadi gerbang terakhir.

Untuk mengubahnya jadi langsung terjadwal: di `push-buffer.mjs` ganti
`saveToDraft: true` menjadi `mode: "customScheduled"` + `dueAt`, dan ambil
timestamp-nya dari `slotDueAt(weekOf, p.day, p.slot)` di `schedule.mjs` — fungsi
itu sudah menghitung konversi WIB→UTC (16.15 WIB = `T09:15:00.000Z`).

## File

| File | Isi |
|---|---|
| `schedule.mjs` | Hari, slot, jam tayang. Satu-satunya tempat cadence didefinisikan. |
| `provider.mjs` | Pilihan model (Gemini free / Claude) + daftar model. |
| `brand-facts.mjs` | Fakta yang boleh diklaim, klaim yang dilarang, harga (sinkron dengan `src/lib/pricing.ts`). Ini system prompt-nya. |
| `lint.mjs` | Pemeriksa klaim terlarang. Dipakai otomatis oleh `generate.mjs` sebelum menyimpan. Sadar negasi: kalimat yang *menyangkal* klaim (mis. "kami tidak mengklaim 100% aman") jadi peringatan, bukan penolakan. |
| `generate.mjs` | Panggil Claude, validasi, tulis `content/packs/<senin>.{json,md}`. |
| `push-buffer.mjs` | Kirim LinkedIn ke Buffer via GraphQL sebagai draft. |

`content/packs/*.json` sengaja di-commit: sudut pandang 4 minggu terakhir
dimasukkan lagi ke prompt supaya Claude tidak mengulang angle yang sama.
