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

Tanda kutip ganda di atas bukan hiasan: pembaca `.env.local` di `env.mjs` melepas
kutip dan menerjemahkan `\n` jadi baris baru **hanya** untuk nilai berkutip ganda.
Tanpa kutip, `\n` akan ikut tercetak apa adanya di setiap draft.

Opsional:

| Env | Guna |
|---|---|
| `INBOX_IMAP_PORT` | Default 993 (TLS). |
| `INBOX_FROM` | Alamat pengirim, kalau login IMAP Anda bukan alamat email. Default = `INBOX_IMAP_USER`. |
| `INBOX_SKIP_DOMAINS` | Domain yang isinya **tidak boleh** dikirim ke LLM sama sekali, dipisah koma. |
| `INBOX_PROVIDER` / `INBOX_MODEL` | Pisah dari `CONTENT_PROVIDER`. Isi `anthropic` untuk pindah ke Claude tanpa mengubah script konten. |

Model default = **Gemini free tier**, memakai `GOOGLE_GENERATIVE_AI_API_KEY` yang
sudah ada. Gratis. Bacalah bagian [Privasi](#privasi) sebelum menganggap ini
sepenuhnya sama dengan `scripts/content/`.

## Pemakaian

```bash
npm run inbox:check    # uji koneksi IMAP + deteksi folder Drafts, tanpa LLM & tanpa menulis
npm run inbox:triage   # cuma memilah: cetak kategori tiap email, tidak menulis draft
npm run inbox:dry      # tulis draft ke layar + scripts/inbox/out/, mailbox tidak disentuh
npm run inbox:draft    # tulis draft ke folder Drafts
npm run inbox:test     # tes offline untuk aturan penyaring (tanpa jaringan)
```

Opsi: `--days 7` (default 3, seberapa jauh ke belakang dicari), `--limit 20`
(batas **email yang diproses model** per run — inilah yang membatasi biaya dan
jatah rate limit, bukan jumlah draft jadi), `--force` (abaikan catatan di
`state.json`; **draft yang sudah ada di mailbox tetap dihormati** — untuk
benar-benar menulis ulang, hapus dulu draftnya).

Urutan yang disarankan, satu tangga per kali:

1. `inbox:check` — koneksi hidup? folder Drafts ketemu?
2. `inbox:triage` beberapa hari — pemilahannya masuk akal?
3. `inbox:dry` — drafnya enak dibaca?
4. `inbox:draft` — baru menulis ke mailbox.

Untuk uji coba, kirim email ke `hello@intellibaseai.com` **dari alamat lain**
(Gmail pribadi, misalnya). Email dari `@intellibaseai.com` sengaja dilewati oleh
loop guard, jadi mengirim dari alamat itu sendiri hanya akan terlihat sebagai
"lewati — email dari domain sendiri".

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
- **`state.json` ditulis sebelum draft di-append, lalu dibatalkan kalau append
  gagal.** Ditulis lebih dulu supaya crash mendadak tidak menghasilkan draft
  dobel; dibatalkan lagi kalau `append` sendiri yang gagal, supaya email itu
  dicoba lagi di run berikutnya. Draft dobel cuma perlu satu klik hapus, draft
  yang hilang diam-diam bisa berarti prospek yang tidak pernah dibalas.
- **Folder Drafts dicari sekali di awal, sebelum email pertama disentuh.** Kalau
  namanya tidak ketemu, seluruh run berhenti dengan satu pesan dan `state.json`
  tidak tersentuh sama sekali.

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

Otomatis lewat GitHub Actions setiap 2 jam — `.github/workflows/inbox-draft.yml`.
Isi lima secret ini di **Settings → Secrets and variables → Actions**:

| Secret | Isi |
|---|---|
| `INBOX_IMAP_HOST` | `imap.hostinger.com` |
| `INBOX_IMAP_USER` | `hello@intellibaseai.com` |
| `INBOX_IMAP_PASS` | password mailbox — hanya bisa baca & menaruh draft, tidak bisa mengirim |
| `INBOX_SIGNATURE` | tanda tangan; boleh multi-baris asli, boleh pakai `\n` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | key yang sama dengan script konten |

Setelah secret terisi, coba dulu lewat **Actions → Inbox draft bot → Run
workflow** sebelum menunggu jadwalnya.

**Kenapa bukan cron di laptop:** draft baru berguna kalau sudah menunggu waktu
Anda membuka email — termasuk sepulang dari akhir pekan. Cron lokal hanya jalan
saat mesinnya nyala.

**Kenapa bukan Vercel cron:** ini inbox pribadi, kredensial IMAP-nya tidak perlu
ada di server produk, dan koneksi IMAP tidak cocok dengan fungsi serverless.

### Kenapa `state.json` tidak dipakai di sana

Setiap run terjadwal dapat container baru, jadi file itu tidak pernah bertahan.
Kalau ia satu-satunya penanda "sudah dibalas", bot akan menulis draft baru untuk
email yang sama tiap 2 jam.

Karena itu penandanya dibaca dari **mailbox**: folder Drafts dan Sent dipindai,
dan email yang sudah punya balasan dilewati (`answeredKeys()` di `imap.mjs`).
Efek sampingnya yang paling berguna — **kalau Anda sudah membalas sendiri, bot
tahu dan tidak ikut mendraft.**

Satu hal yang memang tidak tertutup: email berkategori `perlu-manusia` dan
`abaikan` tidak meninggalkan jejak apa pun di mailbox, jadi keduanya ditriase
ulang tiap run. Itu sebabnya workflow memakai `--days 1`, bukan default 3 —
jendela sempit yang membatasi pengulangan itu, sementara jalan tiap 2 jam sudah
memberi belasan kesempatan untuk setiap email.

## Catatan / TODO

Temuan MINOR dari review 2026-08-20, sengaja **belum** dikerjakan — tidak ada yang
berbahaya, tapi jangan sampai hilang.

Dari review dedupe mailbox:

- `findMailbox()` memanggil `client.list()` tiap kali; satu run menembak 3–4
  perintah LIST untuk data yang sama. Cache-kan hasilnya per koneksi.
- Regex folder Sent tidak menangani nama terlokalisasi ("Terkirim", "Envoyés").
  Sekarang minimal sudah ada peringatan kalau foldernya tidak ketemu.
- `process.exit(tally.gagal > 0 ? 1 : 0)` membuat workflow merah untuk kegagalan
  sementara (rate limit dua kali). Pertimbangkan exit 0 dengan ringkasan, supaya
  notifikasi merah tetap berarti sesuatu.
- `signature()` menerjemahkan `\n` tanpa jalan keluar, jadi tanda tangan yang
  memang ingin memuat backslash-n harfiah mustahil ditulis.
- `env.to?.[0]` hanya melihat penerima pertama saat membangun kunci dedupe.
- `state.json` tetap dibaca lebih dulu di lokal, jadi email yang draftnya Anda
  hapus manual tidak akan didraft ulang tanpa `--force`.

Dari review sebelumnya:

- `slug()` di `draft.mjs` bisa bertabrakan: dua email bersubjek sama saling
  menimpa file di `out/`. Tambahkan potongan hash kunci pada nama file.
- Flag salah ketik diabaikan diam-diam — `--dryrun` (tanpa tanda hubung) jalan
  dalam mode menulis ke mailbox. Tolak argumen yang tidak dikenal.
- `process.exit()` di akhir `draft.mjs` bisa memotong output yang belum
  ter-flush kalau stdout dipipa (bukan diarahkan ke file seperti contoh cron).
- Parameter `skipDomains` di `ruleSkip` menutupi fungsi ekspor `skipDomains`
  di modul yang sama — bikin bingung waktu dibaca.
- `KEEP_DAYS = 90` di `state.mjs` hanya aman selama `--days` < 90; `--days 120`
  akan mendraft ulang email lama.
- `From`/`To` pada draft kehilangan nama tampilan; yang muncul alamat telanjang,
  bukan `IntelliBase AI <hello@…>`.
