# Product Requirement Document (PRD)

## Nama Proyek: TanyaInternal AI (MVP Edition)
**Versi:** 1.0
**Target Tech Stack:** Next.js (App Router), Tailwind CSS, shadcn/ui, Better Auth, Neon (Serverless PostgreSQL), Drizzle ORM, Vercel.

---

## 1. Ringkasan Eksekutif & Objektif
**TanyaInternal AI** adalah platform Micro-SaaS B2B yang berfungsi sebagai pusat pengetahuan (*knowledge base*) internal perusahaan berbasis AI. Aplikasi ini menggunakan metode **RAG (Retrieval-Augmented Generation)** dengan kekuatan pencarian vektor dari `pgvector` untuk memberikan jawaban instan, akurat, dan resmi berdasarkan dokumen internal perusahaan (SOP, regulasi HR, panduan IT) kepada karyawan melalui antarmuka *chat*.

### Objektif Utama:
* **Vibe Coding Friendly:** Membangun fondasi aplikasi yang *type-safe*, terstruktur, dan efisien agar mudah digenerate oleh AI assistant (seperti Cursor/Claude).
* **Multi-Tenant Security:** Menjamin isolasi data yang ketat antar-perusahaan (`companyId`) agar tidak terjadi kebocoran data dokumen.
* **Modular Execution:** Membagi alur kerja menjadi 3 fase independen: Frontend ➔ Backend ➔ Integrasi & Deployment.

---

## 2. Arsitektur Data & Skema Database (Drizzle ORM)

Skema database dirancang untuk mendukung pemisahan data penyewa (*multi-tenancy*) secara absolut. Setiap pengguna, dokumen, dan potongan teks wajib terikat pada `companyId`.

```typescript
import { pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

// Tabel Perusahaan / Tenant
export const companies = pgTable("companies", {
id: text("id").primaryKey(),
name: text("name").notNull(),
createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tabel User (Ekstensi untuk Better Auth)
export const users = pgTable("users", {
id: text("id").primaryKey(),
name: text("name").notNull(),
email: text("email").notNull().unique(),
emailVerified: timestamp("email_verified"),
image: text("image"),
companyId: text("company_id").references(() => companies.id),
role: text("role").$type<"admin" | "employee">().default("employee").notNull(),
createdAt: timestamp("created_at").defaultNow().notNull(),
updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Tabel Induk Dokumen
export const documents = pgTable("documents", {
id: text("id").primaryKey(),
name: text("name").notNull(),
companyId: text("company_id").references(() => companies.id).notNull(),
status: text("status").$type<"processing" | "success" | "failed">().default("processing").notNull(),
createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tabel Potongan Dokumen (Untuk Vector Search)
export const documentChunks = pgTable("document_chunks", {
id: text("id").primaryKey(),
documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
companyId: text("company_id").references(() => companies.id).notNull(),
text: text("text").notNull(),
embedding: vector("embedding", { dimensions: 1536 }), // Dimensi OpenAI text-embedding-3-small
});

// Tabel Sesi Chat Karyawan
export const chatSessions = pgTable("chat_sessions", {
id: text("id").primaryKey(),
userId: text("user_id").references(() => users.id).notNull(),
companyId: text("company_id").references(() => companies.id).notNull(),
title: text("title").notNull(),
createdAt: timestamp("created_at").defaultNow().notNull(),
});
3. Alur Pengembangan Proyek
FASE 1: FRONTEND DEVELOPMENT (UI/UX & Client State)
Fokus penuh pada pembuatan halaman dan komponen visual menggunakan Tailwind CSS dan komponen shadcn/ui. Gunakan mock data terlebih dahulu.
1.1 Halaman Autentikasi (/login, /register)
UI: Gunakan komponen Card, Button, Input, dan Form dari shadcn/ui untuk tampilan minimalis dan profesional.
Fitur: Form standar login dan registrasi. Admin mendaftarkan akun sekaligus instansi perusahaan baru, sedangkan Karyawan masuk menggunakan kredensial yang didaftarkan admin.
1.2 Ruang Chat Karyawan (/chat)
Sidebar Navigasi:
Tombol "New Chat" untuk mereset sesi aktif.
Daftar riwayat chat masa lalu yang dibungkus komponen ScrollArea shadcn/ui.
Informasi profil pengguna dan tombol Log Out di area bawah.
Komponen Chat Utama:
Balon obrolan dua arah dengan penanda Avatar user dan sistem AI.
Animasi berdenyut (skeleton loading) saat AI sedang memproses jawaban.
Citations Accordion: Komponen Accordion shadcn/ui diletakkan tepat di bawah jawaban AI untuk menyembunyikan/menampilkan teks potongan dokumen asli sebagai bukti transparansi jawaban.
1.3 Dashboard Administrator (/admin)
Tab Kelola Dokumen (/admin/documents):
Area seret-dan-lepas (drag and drop zone) untuk mengunggah file PDF dan Word (.docx).
Komponen Table shadcn/ui untuk melacak daftar file dengan kolom: Nama File, Status (Processing / Success), Tanggal, dan Aksi Hapus.
Tab Kelola Karyawan (/admin/users):
Tabel berisi data seluruh karyawan yang terdaftar beserta tombol pintas untuk menambahkan user karyawan baru.
FASE 2: BACKEND DEVELOPMENT (Database, Auth, & RAG Engine)
Fokus pada implementasi logika bisnis, koneksi ke cloud database, proteksi endpoint, dan jalur kecerdasan buatan.
2.1 Konfigurasi Database & Better Auth
Inisialisasi koneksi database Neon PostgreSQL menggunakan Drizzle ORM dan jalankan migrasi skema.
Hubungkan Better Auth dengan Drizzle adapter untuk otomatisasi pembuatan tabel sesi operasional.
Buat middleware proteksi rute global Next.js:
Memblokir akses rute /chat/* jika pengguna belum terautentikasi (unauthenticated).
Memblokir akses rute /admin/* jika pengguna terautentikasi tidak memiliki atribut role === 'admin'.
2.2 API Pipeline Unggah & Ekstraksi Teks (/api/admin/upload)
Bangun route handler untuk menerima file berkas dari dashboard admin.
Ekstrak konten teks mentah dari file PDF atau Word.
Pecah teks menjadi potongan kecil (text chunking) dengan batasan ~1000 karakter per chunk dan overlap sebesar 200 karakter demi menjaga kesinambungan konteks kalimat.
Kirim tiap potongan teks ke API OpenAI (text-embedding-3-small) lalu simpan string teks beserta nilai array vektornya ke tabel document_chunks di Neon.
2.3 API Inferensi RAG (/api/chat)
Terima parameter pertanyaan ter-update dari klien beserta companyId user aktif.
Konversi teks pertanyaan menjadi nilai vektor menggunakan model embedding yang sama.
Eksekusi vector similarity search pada database Neon menggunakan operator <=> bawaan pgvector:
SQL
SELECT text FROM document_chunks
WHERE company_id = current_user_company_id
ORDER BY embedding <=> query_vector LIMIT 4;
Rakit system prompt ketat untuk LLM (gpt-4o-mini) dengan menyisipkan 4 potongan teks hasil pencarian tadi sebagai konteks.
Instruksi Prompt Utama: "Jawablah pertanyaan hanya berdasarkan konteks dokumen yang diberikan. Apabila jawaban tidak dapat divalidasi dari teks konteks tersebut, jawab dengan template: 'Maaf, informasi tidak ditemukan dalam dokumen internal perusahaan.' Jangan mencoba mengarang jawaban di luar konteks."
3. FASE 3: INTEGRATION, DEPLOYMENT, & TESTING
Tahap akhir untuk menjahit interaksi frontend ke backend, merilisnya ke internet, dan melakukan uji penetrasi sekuriti.
3.1 Integrasi Alur Data Komparatif
Ganti seluruh penggunaan mock data di sisi frontend dengan panggilan fetch() ke API endpoint atau menggunakan Next.js Server Actions.
Implementasikan library Vercel AI SDK (ai) menggunakan fungsi streamText agar teks respons dari AI dapat mengalir secara dinamis (chat streaming effect) pada antarmuka pengguna.
3.2 Prosedur Rilis ke Vercel
Sambungkan repositori Git proyek Anda ke platform Vercel untuk mengaktifkan otomatisasi CI/CD.
Konfigurasikan seluruh kunci rahasia pada panel Environment Variables di dashboard Vercel:
DATABASE_URL (String URI koneksi database cluster Neon)
BETTER_AUTH_SECRET (Kunci enkripsi session data Better Auth)
OPENAI_API_KEY (Token akses billing API OpenAI)
BETTER_AUTH_URL (Domain alamat produksi, misal: https://tanyainternal.vercel.app)
3.3 Protokol Pengujian & Penjaminan Mutu (QA Testing)
Aplikasi dianggap siap komersial jika telah lulus tiga skenario pengujian kritis berikut:
| No | Target Pengujian | Metodologi Tes | Kriteria Kelulusan (Lolos Uji) |
| --- | --- | --- | --- |
| 1 | Isolasi Data (Multi-tenancy) | Menggunakan token akses Perusahaan A untuk memanggil data document_chunks milik Perusahaan B secara manual via Postman/Curl. | Endpoint API menolak mentah-mentah permintaan dan mengembalikan status kode 403 Forbidden. |
| 2 | Integritas Jawaban (Anti-Halusinasi) | Mengirimkan pertanyaan acak di luar dokumen kantor (Contoh: "Bagaimana cara merawat tanaman janda bolong?"). | AI konsisten menjawab kalimat penolakan standar sesuai instruksi prompt utama tanpa berhalusinasi. |
| 3 | Proteksi Bandwidth (File Restriction) | Mengunggah paksa dokumen dengan ukuran kapasitas file sebesar 25 MB di dashboard admin. | Komponen frontend langsung membatalkan proses unggah secara instan dan menampilkan notifikasi peringatan batas maksimum file (10 MB). |
