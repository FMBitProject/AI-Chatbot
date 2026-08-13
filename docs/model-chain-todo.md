# Model fallback chain — catatan tertunda

Temuan MINOR dari self-review `src/lib/models.ts` (13 Agustus 2026). Sengaja
**tidak** diperbaiki saat itu supaya PR rantai model tetap fokus. Tidak ada yang
berbahaya kalau dibiarkan; catat di sini supaya tidak hilang.

Temuan CRITICAL/MEDIUM dari review yang sama sudah diperbaiki di PR tersebut
(kunci BYOK Gemini, teks Terms + Privacy, komentar fallback, urutan
resolveByok vs kuota di Slack).

---

## 1. Baris mati di ujung `generateWithFallback`

`src/lib/models.ts` — `throw lastError` sesudah loop tidak pernah tercapai:
setiap iterasi pasti `return` atau `throw`, dan iterasi terakhir selalu
`canFallBack === false`. TypeScript butuh penutup itu supaya tipe kembaliannya
sah, jadi menghapusnya begitu saja tidak bisa. Kalau dirapikan, ubah loop jadi
bentuk yang membuat kompilator paham, bukan sekadar hapus barisnya.

**Risiko dibiarkan:** nol, hanya membingungkan pembaca.

## 2. Deteksi rate limit lebih sempit dari versi lama

`isRateLimitFailure` di `src/lib/models.ts` menggantikan `describeAiFailure`
lama di `/api/chat` yang mencocokkan kata `"quota"` di mana saja. Yang baru
butuh salah satu dari: `statusCode` 429, `"exceeded your current quota"`,
`"resource exhausted"`, `"rate limit"`, `"too many requests"`,
`"tokens per minute"`, `"request too large"`.

Pesan seperti `"daily quota reached"` tanpa 429 sekarang diklasifikasi
`AI_ERROR` dan **menghentikan rantai**, bukan naik ke model berikutnya.

**Risiko dibiarkan:** teoretis — pesan asli Groq dan Google sudah diverifikasi
tercakup. Perluas hanya kalau muncul di log produksi, dan tambahkan pola yang
benar-benar terlihat, bukan tebakan.

## 3. `BATCH_CHAIN` bisa kosong tanpa peringatan

`BATCH_CHAIN` diturunkan dari `INTERACTIVE_CHAIN` dengan `filter(provider ===
"groq")`. Kalau suatu saat link Groq keluar dari rantai interaktif, `BATCH_CHAIN`
jadi `[]` dan indexer menerima pesan `"No generation provider is configured"` —
menyesatkan, karena providernya ada, cuma rantai batch-nya yang kosong.

Efek samping di `src/lib/indexing.ts`: `Math.floor(SUMMARY_TIMEOUT_MS /
BATCH_CHAIN.length)` jadi `Infinity`. Aman **hanya** karena `generateWithFallback`
melempar lebih dulu sebelum nilai itu dipakai.

**Kalau diperbaiki:** beri `BATCH_CHAIN` pesan error sendiri, atau definisikan
eksplisit alih-alih hasil filter.

## 4. Ringkasan kosong sekarang `null`, dulu `""`

Guard `if (!text.trim()) throw` di `generateWithFallback` berarti model yang
menjawab kosong membuat `summary` tetap `null` di `src/lib/indexing.ts`.
Sebelumnya tersimpan sebagai string kosong.

**Penilaian:** `null` lebih benar (tidak ada ringkasan ≠ ringkasan kosong).
Dicatat karena ini perubahan perilaku yang tidak disebut di commit message,
bukan karena perlu dikembalikan.

## 5. Field `model` di `/v1/query` sekarang berubah-ubah

Dulu string konstan `"llama-3.3-70b-versatile"`, sekarang model yang benar-benar
menjawab. Ini memang tujuannya — dengan fallback di belakangnya nilai konstan
akan jadi bohong — tapi integrasi yang menyimpan nilai itu sebagai konstanta
akan melihat sesuatu yang baru.

**Tindakan:** sebut di catatan rilis / dokumentasi API sebelum ada pemakai API
publik yang serius. Belum ada pelanggan API saat ini, jadi belum mendesak.
