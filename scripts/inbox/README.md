# Bot draft balasan email

Membaca inbox `hello@intellibaseai.com`, memilah mana yang perlu dibalas, lalu
menulis draft balasan ke **folder Drafts**. Anda yang membaca dan menekan kirim.

> **Bot ini tidak bisa mengirim email.** Bukan karena dilarang di prompt — karena
> tidak ada satu pun kredensial SMTP di seluruh `scripts/inbox/`. Yang ada hanya
> IMAP untuk membaca inbox dan menaruh draft. Kalau suatu hari ada yang menambah
> transport pengirim di sini, pengaman utamanya hilang.

## Setup (sekali)

Ambil detail IMAP di panel Hostinger → Email → Konfigurasi. Lalu di `.env.local`:

```
INBOX_IMAP_HOST=imap.hostinger.com
INBOX_IMAP_USER=hello@intellibaseai.com
INBOX_IMAP_PASS=...
INBOX_SIGNATURE="Salam,\nNama Anda\nIntelliBase — intellibaseai.com"
```

`INBOX_SIGNATURE` ditempelkan oleh kode, bukan ditulis model — supaya draft tidak
pernah keluar tanpa tanda tangan atau, lebih buruk, dengan nama karangan. Kalau
tidak diisi, dipakai tanda tangan generik "Tim IntelliBase".

Opsional:

| Env | Guna |
|---|---|
| `INBOX_IMAP_PORT` | Default 993 (TLS). |
| `INBOX_SKIP_DOMAINS` | Domain yang isinya **tidak boleh** dikirim ke LLM sama sekali, dipisah koma. |
| `INBOX_PROVIDER` / `INBOX_MODEL` | Pisah dari `CONTENT_PROVIDER`. Isi `anthropic` untuk pindah ke Claude tanpa mengubah script konten. |

Model default = **Gemini free tier**, memakai `GOOGLE_GENERATIVE_AI_API_KEY` yang
sudah ada. Gratis. Bacalah bagian [Privasi](#privasi) sebelum menganggap ini
sepenuhnya sama dengan `scripts/content/`.

## Pemakaian

```bash
npm run inbox:triage   # cuma memilah: cetak kategori tiap email, tidak menulis draft
npm run inbox:dry      # tulis draft ke layar + scripts/inbox/out/, mailbox tidak disentuh
npm run inbox:draft    # tulis draft ke folder Drafts
npm run inbox:test     # tes offline untuk aturan penyaring (tanpa jaringan)
```

Opsi: `--days 7` (default 3, seberapa jauh ke belakang dicari), `--limit 20`
(batas draft per run), `--force` (abaikan catatan "sudah pernah dibalas").

Mulailah dengan `inbox:triage` beberapa hari. Kalau pemilahannya sudah benar,
naik ke `inbox:dry`. Baru setelah drafnya enak dibaca, pakai `inbox:draft`.

## Cara kerjanya

```
IMAP INBOX (3 hari terakhir, TIDAK ditandai sudah dibaca)
  ↓  lapis 1: aturan — tanpa LLM, jadi email ini tidak pergi ke mana-mana
     domain sendiri · no-reply · Auto-Submitted · Precedence: bulk ·
     List-Unsubscribe · subjek out-of-office/bounce · badan kosong
  ↓  lapis 2: triase LLM → prospek | dukungan | perlu-manusia | abaikan
  ↓  hanya prospek & dukungan yang didraft
  ↓  linter klaim (scripts/content/lint.mjs)
  ↓  APPEND ke folder Drafts, dengan In-Reply-To supaya nyantol di thread asli
```

Beberapa keputusan yang sengaja diambil:

- **Email tidak pernah ditandai `\Seen`.** Cara IMAP yang lazim untuk mencari
  email baru adalah mencari yang belum dibaca, tapi membaca isinya membuat server
  menandainya sudah dibaca. Inbox Anda tidak boleh berubah gara-gara bot. Jadi
  pencarian memakai tanggal, dan pengulangan dicegah `state.json`.
- **`perlu-manusia` tidak dapat draft sama sekali.** Kontrak, negosiasi harga,
  SLA, on-premise, tender, keluhan berat, atau apa pun yang memuat data pribadi/
  medis orang lain. Di kategori itu draft yang fasih justru berbahaya — itu yang
  paling mungkin terkirim setelah dibaca sekilas.
- **Linter yang sama dengan konten mingguan**, dikurangi satu rule:
  `founder-voice` melarang kata "saya" karena akun LinkedIn adalah halaman
  perusahaan. Di email yang Anda tandatangani sendiri, "saya" justru benar.
  Semua rule lain tetap berlaku, dan justru lebih penting di sini: klaim palsu
  dalam email satu-lawan-satu adalah sesuatu yang bisa ditindaklanjuti penerima.
  Draft yang kena linter **tidak masuk Drafts** — mendarat di `out/` beserta
  alasannya.
- **`state.json` ditulis sebelum draft di-append.** Kalau proses mati di antara
  keduanya, akibatnya satu email tidak terdraft (ketahuan waktu Anda baca inbox).
  Urutan sebaliknya menghasilkan draft dobel — ketahuan setelah salah satunya
  terkirim.

## Privasi

Isi email yang lolos lapis 1 **dikirim ke Google Gemini** untuk ditriase dan
didraft. Free tier Gemini boleh memakai input untuk pelatihan model. Ini beda
situasi dengan `scripts/content/`, yang hanya pernah melihat materi marketing
kita sendiri — di sini yang diproses adalah tulisan orang lain.

Yang membatasi paparan:

- Lampiran **tidak pernah dibaca**, hanya teks badan email (dipotong 4.000
  karakter), dan kutipan thread lama dibuang sebelum dikirim.
- Notifikasi, newsletter, dan mail otomatis disaring lapis 1 — tidak pernah
  sampai ke Gemini.
- `INBOX_SKIP_DOMAINS` memblokir domain tertentu sebelum LLM apa pun dipanggil.
- Kalau nanti ada rumah sakit yang mengirim contoh dokumen lewat email, pindah ke
  Claude: `INBOX_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` di `.env.local`.
  Satu baris, tanpa ubah kode.

## Menjadwalkan

Jalankan manual dulu. Kalau sudah stabil, cron di mesin Anda sendiri:

```
0 8,16 * * *  cd /path/ke/ai-chatbot && npm run inbox:draft >> /tmp/inbox.log 2>&1
```

**Jangan dipasang di Vercel cron.** Ini inbox pribadi: kredensial IMAP-nya tidak
perlu ada di server produk, dan koneksi IMAP tidak cocok dengan fungsi serverless.
