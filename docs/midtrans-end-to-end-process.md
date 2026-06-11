# Informasi End-to-End Process Pembayaran — IntelliBase

**Nama Produk:** IntelliBase  
**Jenis Produk/Jasa:** Layanan software berbasis cloud (SaaS) — platform AI chatbot untuk bisnis, ditagihkan secara bulanan.  
**Mata Uang:** IDR (Rupiah Indonesia)  
**Recurring:** Tidak otomatis — customer melakukan pembayaran ulang setiap bulan secara manual.

---

## Paket Langganan

| Paket        | Harga Normal  | Harga Promo   | Masa Aktif |
|--------------|---------------|---------------|------------|
| Free         | Gratis        | Gratis        | Selamanya  |
| Professional | Rp 299.000    | Rp 200.000    | 30 hari    |
| Enterprise   | Rp 799.000    | Rp 500.000    | 30 hari    |

---

## Alur Lengkap dari Pemesanan hingga Pembayaran

### 1. Customer Melihat Halaman Pricing

Customer mengunjungi halaman `/pricing` dan melihat perbandingan paket Free, Professional, dan Enterprise beserta fitur dan harga masing-masing.

### 2. Customer Memilih Paket Berbayar

Customer mengklik tombol berlangganan pada paket Professional atau Enterprise.

### 3. Autentikasi

- Jika belum memiliki akun → diarahkan ke halaman `/register` untuk mendaftar.
- Jika sudah memiliki akun → diarahkan ke `/login`.
- Hanya pengguna dengan role **admin** perusahaan yang dapat melakukan pembelian.

### 4. Inisiasi Transaksi

Setelah login, customer mengklik tombol bayar. Sistem melakukan hal berikut:

1. Backend menerima request `POST /api/payment/create` beserta pilihan paket.
2. Server membuat transaksi ke Midtrans Snap API dengan detail:
   - `order_id` format: `IB-PROFESSIONAL-{timestamp}` atau `IB-ENTERPRISE-{timestamp}`
   - `gross_amount` sesuai harga paket
   - `customer_details` berisi nama dan email admin
3. Record transaksi disimpan ke database dengan status `pending`.
4. Server mengembalikan **Snap Token** ke frontend.

### 5. Pembayaran via Midtrans Snap

1. Frontend memuat script Midtrans Snap.js secara dinamis.
2. Popup pembayaran Midtrans ditampilkan kepada customer.
3. Customer memilih metode pembayaran yang tersedia (transfer bank, kartu kredit, e-wallet, QRIS, dll.) dan menyelesaikan pembayaran di dalam popup Snap.

### 6. Redirect Setelah Pembayaran

Setelah customer menyelesaikan proses di popup Snap:

| Hasil        | Halaman Tujuan      |
|--------------|---------------------|
| Berhasil     | `/payment/success`  |
| Pending      | `/payment/pending`  |
| Gagal/Batal  | `/payment/failed`   |

### 7. Konfirmasi via Webhook Midtrans

Midtrans mengirim notifikasi HTTP POST ke endpoint `/api/payment/webhook`. Server:

1. Memverifikasi **signature key** dari Midtrans menggunakan SHA-512 (`order_id + status_code + gross_amount + server_key`).
2. Memperbarui status transaksi di database berdasarkan hasil notifikasi:
   - `settlement` atau `capture` (fraud_status: `accept`) → status diubah menjadi `paid`
   - `cancel` / `deny` / `expire` → status diubah menjadi `failed`
   - `pending` → status tetap `pending`

### 8. Aktivasi Layanan

Setelah pembayaran terkonfirmasi berhasil:

- Status langganan perusahaan diperbarui sesuai paket yang dibeli.
- Masa aktif langganan ditetapkan selama **30 hari** sejak tanggal pembayaran.
- Customer mendapatkan akses penuh ke fitur paket yang dipilih.

---

## Diagram Alur

```
Customer → Halaman Pricing → Pilih Paket
         ↓
      Login / Register (jika belum)
         ↓
      Klik Bayar → POST /api/payment/create
         ↓
      Midtrans Snap Token diterima
         ↓
      Popup Snap Midtrans ditampilkan
         ↓
      Customer memilih metode & bayar
         ↓
   ┌─────────────────────────────┐
   │  Berhasil → /payment/success│
   │  Pending  → /payment/pending│
   │  Gagal    → /payment/failed │
   └─────────────────────────────┘
         ↓
   Webhook Midtrans → POST /api/payment/webhook
         ↓
   Verifikasi signature → Update status DB
         ↓
   Langganan aktif (jika berhasil)
```

---

## Endpoint Terkait

| Endpoint                    | Method | Keterangan                                      |
|-----------------------------|--------|-------------------------------------------------|
| `/api/payment/create`       | POST   | Membuat transaksi Snap dan menyimpan ke DB      |
| `/api/payment/webhook`      | POST   | Menerima notifikasi status pembayaran Midtrans  |
| `/api/payment/verify`       | POST   | Verifikasi manual status transaksi ke Midtrans  |
