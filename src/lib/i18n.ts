import { PLAN_LIMITS } from "./plan-limits";
import { MAX_UPLOAD_MB } from "./upload-limits";

export type Lang = "id" | "en";

// Quota numbers in copy are pulled from PLAN_LIMITS so pricing text can never
// drift from what the API actually enforces.
//
// That claim used to be true of exactly one number. Every Starter and
// Professional figure on the pricing page was a literal typed into the copy —
// "5 karyawan", "300 pertanyaan / hari" — so raising Professional's daily
// allowance in plan-limits.ts would have left the page advertising the old one,
// with this comment sitting here telling the next person it could not happen.
// Every quota printed anywhere below now reads from PLAN_LIMITS.
const sta = PLAN_LIMITS.starter;
const per = PLAN_LIMITS.personal;
const pro = PLAN_LIMITS.professional;
const ent = PLAN_LIMITS.enterprise;
// Annotated `number`, not left to inference. PLAN_LIMITS is `as const`, so
// these are literal types (2000, 400, …), and TypeScript then rejects `=== -1`
// below as a comparison that can never be true. It is right about today's
// values and wrong about the point: the whole reason the checks exist is the
// day somebody edits that file. Widening keeps the guards compilable without
// weakening anything the app relies on.
const entDaily: number = ent.maxQuestionsPerDay;
const entPerUser: number = ent.maxQuestionsPerDayPerUser;
const proDaily: number = pro.maxQuestionsPerDay;
const proPerUser: number = pro.maxQuestionsPerDayPerUser;
// No staDaily/staMonthly any more, and their absence is the point: Starter has
// no question allowance to advertise because it has no AI answers (see
// canUseAiAnswers in @/lib/pricing). The numbers still exist in PLAN_LIMITS as
// the allowance the tier would get if that rule were ever relaxed; what must not
// exist is copy quoting them, which is what made the pricing page promise a
// chat the app now declines to give.
const perDaily: number = per.maxQuestionsPerDay;
const perMonthly: number = per.maxQuestionsPerMonth;
// -1 is how PLAN_LIMITS spells "unlimited", and it reaches these strings
// unchanged: set a limit back to -1 and the pricing table would advertise
// "-1 karyawan".
//
// Substituting the word "unlimited" for the number is not enough on its own —
// it only moves the damage into the grammar ("Paket Enterprise Tanpa batas
// pertanyaan/hari"). So these build the whole phrase, and the unlimited case
// is written as its own sentence rather than as a number slot with a word
// dropped into it.
const idNum = (n: number) => n.toLocaleString("id-ID");
const enNum = (n: number) => n.toLocaleString("en-US");

const idLimit = (n: number, noun: string) =>
  n === -1 ? `${noun} tanpa batas` : `${idNum(n)} ${noun}`;
const enLimit = (n: number, noun: string) =>
  n === -1 ? `Unlimited ${noun}` : `${enNum(n)} ${noun}`;

// Sentence-initial in the feature lists, so the Indonesian phrase — which puts
// the noun first — needs its capital back. The numbered form is unaffected.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The daily-question allowance reads in two places and has an awkward unit:
// "pertanyaan / hari tanpa batas" is not a sentence anyone would write, and an
// unlimited daily allowance is simply unlimited.
const idDaily = (n: number) => (n === -1 ? "Pertanyaan tanpa batas" : `${idNum(n)} pertanyaan / hari`);
const enDaily = (n: number) => (n === -1 ? "Unlimited questions" : `${enNum(n)} questions / day`);

// The Enterprise quota clause in the FAQ, including the per-user parenthetical
// — which is dropped entirely when there is no per-user brake to describe.
//
// Only Enterprise gets an unlimited branch. Starter is the free tier and
// Professional sits between two priced tiers; if either ever went uncapped the
// whole paragraph would need rewriting rather than a substitution, so pretending
// a branch here would cover it is worse than not having one.
const idEntQuota =
  entDaily === -1
    ? "Paket Enterprise tidak dibatasi."
    : `Paket Enterprise ${idNum(entDaily)} pertanyaan/hari${
        entPerUser === -1 ? "" : ` (maksimal ${idNum(entPerUser)} per karyawan)`
      }.`;
const enEntQuota =
  entDaily === -1
    ? "Enterprise is uncapped."
    : `Enterprise allows ${enNum(entDaily)} questions/day${
        entPerUser === -1 ? "" : ` (at most ${enNum(entPerUser)} per employee)`
      }.`;

// Personal's allowance, which reads differently depending on whether there is a
// monthly cap at all — today there is not, and a plan bounded only by the day
// should say so rather than print "-1 pertanyaan/bulan". Declared here, below
// idNum/enNum, because these are plain module-level consts evaluated in order:
// referencing a helper above its own definition is a ReferenceError at import,
// not a lint warning.
const idPersonalQuota = perMonthly === -1
  ? `Pertanyaan bulanan tanpa batas · ${idNum(perDaily)}/hari`
  : `${idNum(perMonthly)} pertanyaan/bulan · ${idNum(perDaily)}/hari`;
const enPersonalQuota = perMonthly === -1
  ? `Unlimited questions per month · ${enNum(perDaily)}/day`
  : `${enNum(perMonthly)} questions/month · ${enNum(perDaily)}/day`;

export const t = {
  id: {
    welcome: "Selamat datang kembali",
    // Netral, bukan bercabang. Halaman ini tidak perlu tahu jenis akun —
    // kredensialnya yang menentukan, dan servernya yang sudah tahu. Yang salah
    // dulu adalah kalimatnya: seorang individu disambut "akun perusahaan Anda"
    // di layar pertama setelah dia sengaja memilih mendaftar sebagai individu.
    subtitle: "Masuk ke akun Anda",
    email: "Email",
    emailPlaceholder: "nama@email.com",
    password: "Kata Sandi",
    passwordPlaceholder: "Masukkan kata sandi",
    forgotPassword: "Lupa kata sandi?",
    login: "Masuk",
    noAccount: "Belum punya akun?",
    // Dua jalan, karena di sinilah percabangannya benar-benar ada: yang satu
    // membawa `?type=individual`, yang satu tidak. Satu link "Daftar
    // Perusahaan" diam-diam memilihkan jenis akun yang tidak bisa diubah lagi
    // untuk orang yang datang ke sini karena salah klik.
    registerIndividual: "Daftar Individu",
    registerCompany: "Daftar Perusahaan",
    viewPricing: "Lihat paket harga →",
    hero1: "Knowledge Base Cerdas\nuntuk Dokumen Anda",
    heroDesc: "Akses SOP, panduan, catatan, dan dokumen penting Anda secara instan lewat AI — tanpa perlu membuka filenya satu per satu.",
    f1Title: "Knowledge Base Terpusat",
    f1Desc: "Semua dokumen penting dalam satu tempat",
    f2Title: "Jawaban Instan",
    f2Desc: "AI menjawab dalam hitungan detik berdasarkan dokumen resmi",
    f3Title: "Aman & Terisolasi",
    f3Desc: "Data tiap akun terisolasi penuh, tidak bocor",
    loginFailed: "Login Gagal",
    error: "Terjadi kesalahan. Silakan coba lagi.",
    // register
    registerTitle: "Daftar sebagai Admin",
    registerSubtitle: "Buat akun dan daftarkan perusahaan Anda",
    companyName: "Nama Perusahaan",
    companyPlaceholder: "PT. Maju Bersama",
    fullName: "Nama Lengkap Admin",
    namePlaceholder: "Budi Santoso",
    passwordMin: "Minimal 8 karakter",
    registerBtn: "Daftar & Mulai Gratis",
    terms: "Dengan mendaftar, Anda menyetujui Syarat & Ketentuan kami",
    hasAccount: "Sudah punya akun?",
    loginHere: "Masuk di sini",
    heroRegister: "Mulai gratis,\nkembangkan sesuai kebutuhan",
    heroRegisterDesc: "Daftarkan perusahaan Anda dan mulai transformasi cara karyawan mengakses informasi internal.",
    b1: "Paket Starter gratis selamanya, tidak perlu kartu kredit",
    b2: "Setup dalam 5 menit",
    b3: "Dukungan PDF, DOCX, Excel & PowerPoint",
    b4: "Isolasi data penuh antar perusahaan",
    tip: "💡 Tahukah Anda?",
    // Neither the 2,5 jam nor the 90% was ours to claim — the first came from a
    // study we never cited, the second was the ROI calculator's old headline
    // multiplier, which no longer exists. Same point, nothing borrowed.
    tipDesc: "Mencari SOP atau kebijakan internal bisa menghabiskan puluhan menit setiap hari, per karyawan. IntelliBase memangkas sebagian besar waktu itu.",
    registerFailed: "Registrasi Gagal",
    checkEmail: "Cek Email Anda",
    checkEmailDesc: "Kami telah mengirim link verifikasi ke",
    checkEmailNote: "Klik link di email tersebut untuk mengaktifkan akun Anda. Cek folder Spam jika tidak muncul.",
    // Individual accounts. The choice is made once, at signup, and cannot be
    // changed afterwards — so the copy has to be clear about what each one is
    // before the person picks, not after.
    accountIndividual: "Individu",
    accountCompany: "Perusahaan",
    accountIndividualHint: "Untuk diri sendiri — dokumen pribadi, folder sendiri, tanpa kelola karyawan.",
    accountCompanyHint: "Untuk tim — kelola karyawan, akses per departemen, dan analitik tim.",
    accountPermanentNote: "Jenis akun tidak bisa diubah setelah mendaftar.",
    registerTitleIndividual: "Daftar Akun Individu",
    registerSubtitleIndividual: "Buat knowledge base pribadi Anda sendiri",
    fullNameIndividual: "Nama Lengkap",
    heroRegisterIndividual: "Knowledge base pribadi,\nsiap dalam 5 menit",
    heroRegisterIndividualDesc: "Kumpulkan catatan, panduan, dan dokumen Anda dalam satu tempat — lalu tanyakan apa saja ke AI.",
    bi1: "Paket gratis selamanya, tidak perlu kartu kredit",
    bi2: "Folder pribadi untuk merapikan dokumen",
    bi3: "Dukungan PDF, DOCX, Excel & PowerPoint",
    bi4: "Hanya Anda yang bisa mengakses dokumen Anda",
  },
  en: {
    welcome: "Welcome back",
    subtitle: "Sign in to your account",
    email: "Email",
    emailPlaceholder: "name@email.com",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    forgotPassword: "Forgot password?",
    login: "Sign In",
    noAccount: "Don't have an account?",
    registerIndividual: "Register as Individual",
    registerCompany: "Register a Company",
    viewPricing: "View pricing →",
    hero1: "Smart Knowledge Base\nfor Your Documents",
    heroDesc: "Reach your SOPs, guides, notes and important documents instantly through AI — no more opening files one by one.",
    f1Title: "Centralized Knowledge Base",
    f1Desc: "Every important document in one place",
    f2Title: "Instant Answers",
    f2Desc: "AI answers in seconds based on official documents",
    f3Title: "Secure & Isolated",
    f3Desc: "Every account's data is fully isolated, no leaks",
    loginFailed: "Login Failed",
    error: "An error occurred. Please try again.",
    // register
    registerTitle: "Register as Admin",
    registerSubtitle: "Create your account and register your company",
    companyName: "Company Name",
    companyPlaceholder: "Acme Corp",
    fullName: "Admin Full Name",
    namePlaceholder: "John Doe",
    passwordMin: "Minimum 8 characters",
    registerBtn: "Register & Start Free",
    terms: "By registering, you agree to our Terms & Conditions",
    hasAccount: "Already have an account?",
    loginHere: "Sign in here",
    heroRegister: "Start free,\ngrow as you need",
    heroRegisterDesc: "Register your company and start transforming how employees access internal information.",
    b1: "Starter plan free forever, no credit card required",
    b2: "Setup in 5 minutes",
    b3: "PDF, DOCX, Excel & PowerPoint support",
    b4: "Full data isolation between companies",
    tip: "💡 Did you know?",
    tipDesc: "Finding an SOP or an internal policy can eat tens of minutes a day, per employee. IntelliBase cuts most of that time.",
    registerFailed: "Registration Failed",
    checkEmail: "Check Your Email",
    checkEmailDesc: "We've sent a verification link to",
    checkEmailNote: "Click the link in the email to activate your account. Check your Spam folder if you don't see it.",
    accountIndividual: "Individual",
    accountCompany: "Company",
    accountIndividualHint: "For yourself — personal documents, your own folders, no employees to manage.",
    accountCompanyHint: "For a team — manage employees, department access, and team analytics.",
    accountPermanentNote: "The account type cannot be changed after signing up.",
    registerTitleIndividual: "Create an Individual Account",
    registerSubtitleIndividual: "Build your own personal knowledge base",
    fullNameIndividual: "Full Name",
    heroRegisterIndividual: "A personal knowledge base,\nready in 5 minutes",
    heroRegisterIndividualDesc: "Keep your notes, guides and documents in one place — then ask the AI anything about them.",
    bi1: "Free plan forever, no credit card required",
    bi2: "Personal folders to keep documents tidy",
    bi3: "PDF, DOCX, Excel & PowerPoint support",
    bi4: "Only you can reach your documents",
  },
} as const;

export const admin = {
  id: {
    title: "Dashboard Admin",
    tabs: { documents: "Kelola Dokumen", users: "Kelola Karyawan", analytics: "Analitik", persona: "AI Persona", audit: "Audit Log" },
    openChat: "Buka Chat",
    logout: "Keluar",
    uploadTitle: "Upload Dokumen",
    uploadDesc: "Upload SOP, regulasi HR, atau panduan IT dalam format PDF, DOCX, Excel, atau PowerPoint.",
    docList: "Daftar Dokumen",
    noDoc: "Belum ada dokumen yang diupload",
    colName: "Nama File",
    colStatus: "Status",
    colDate: "Tanggal",
    colAction: "Aksi",
    statusSuccess: "Sukses",
    statusProcessing: "Processing",
    statusFailed: "Gagal",
    statusQueued: "Antre",
    aiSummary: "Ringkasan AI",
    addEmployee: "Tambah Karyawan",
    noEmployee: "Belum ada karyawan terdaftar",
    employees: "karyawan terdaftar",
    colName2: "Nama",
    colEmail: "Email",
    colRole: "Role",
    colJoin: "Bergabung",
    exportExcel: "Export Excel",
    exportPDF: "Export PDF",
    totalChat: "Total Sesi Chat",
    totalQuestion: "Total Pertanyaan",
    totalDoc: "Total Dokumen",
    totalEmployee: "Total Karyawan",
    recentQ: "Pertanyaan Terbaru",
    noQuestion: "Belum ada pertanyaan",
    personaTitle: "Custom AI Persona",
    personaDesc: "Sesuaikan identitas dan kepribadian asisten AI Anda.",
    aiName: "Nama Asisten AI",
    aiNameHint: "Nama ini akan muncul di header chat dan respons AI",
    aiNamePlaceholder: "Contoh: Ava, Max, Aria, atau nama kustom",
    greeting: "Greeting / Pesan Sambutan",
    // Two versions, because the example is the fastest way to tell someone what
    // this product thinks they are. "PT Maju Bersama" shown to a person who
    // signed up as an individual answers a question they did not ask.
    greetingPlaceholder: "Contoh: Halo! Saya Ava, asisten AI PT Maju Bersama. Ada yang bisa saya bantu?",
    greetingPlaceholderIndividual: "Contoh: Halo! Saya Ava. Mau cari apa di dokumen Anda hari ini?",
    // The preview bubble's fallback, shown until a greeting is actually typed.
    previewGreeting: "Selamat datang! Saya siap membantu Anda menemukan informasi dari dokumen internal perusahaan.",
    previewGreetingIndividual: "Selamat datang! Saya siap membantu Anda menemukan informasi dari dokumen Anda sendiri.",
    personality: "Instruksi Kepribadian (opsional)",
    personalityHint: "Instruksi tambahan untuk mengatur gaya dan tone AI",
    personalityPlaceholder: "Contoh: Selalu jawab dengan nada ramah namun profesional. Gunakan kata 'Anda' bukan 'kamu'. Tambahkan emoji relevan di akhir jawaban.",
    savePersona: "Simpan Persona",
    savingPersona: "Menyimpan...",
    auditTitle: "Audit Log",
    auditDesc: "Pantau siapa bertanya apa dan kapan.",
    searchAudit: "Cari pertanyaan atau nama karyawan...",
    noAudit: "Belum ada data audit",
    dropzone: "Seret & lepas file ke sini, atau klik untuk memilih",
    dropzoneHint: `PDF, DOCX, XLSX, PPTX · Maks. ${MAX_UPLOAD_MB} MB per file`,
    dropzoneActive: "Lepaskan file di sini...",
    uploadBtn: "Upload",
    uploading: "Mengupload...",
    loading: "Memuat...",
    loadFailed: "Gagal memuat data. Periksa koneksi Anda, lalu coba lagi.",
    retry: "Coba Lagi",
    fileTooLarge: "File terlalu besar",
    fileTooLargeDesc: `melebihi batas ${MAX_UPLOAD_MB} MB. Upload dibatalkan.`,
    formatNotSupported: "Format tidak didukung",
    formatNotSupportedDesc: "bukan file PDF, DOCX, XLSX, atau PPTX.",
    moreFiles: "file lainnya",
    uploadProgress: "Mengupload",
    indexProgress: "Mengindeks",
    indexWaiting: "Menunggu batas kuota AI",
    indexQueued: "Menunggu diindeks",
    indexPaused: "Pengindeksan dijeda",
    indexPausedDesc: "Layanan AI sedang membatasi permintaan. Sisa dokumen akan diindeks otomatis nanti — atau klik Lanjutkan untuk mencoba lagi sekarang.",
    indexElsewhere: "Sedang diindeks di tempat lain",
    indexElsewhereDesc: "Antrean dokumen ini sedang dikerjakan — mungkin oleh tab lain yang masih terbuka, atau oleh proses otomatis harian. Tidak perlu melakukan apa pun; daftar dokumen di bawah akan ikut ter-update sendiri.",
    uploadedCount: "dokumen berhasil diupload.",
    indexingContinues: "Pengindeksan berjalan di latar belakang — biarkan halaman ini terbuka sampai selesai.",
    failedPanelTitle: "File yang gagal diupload",
    retryFailedBtn: "Coba ulang file yang gagal",
    reindexBtn: "Indeks ulang",
    reindexStarted: "Dokumen dimasukkan kembali ke antrean pengindeksan.",
    resumeIndexBtn: "Lanjutkan",
    reindexFailed: "Gagal memasukkan dokumen ke antrean.",
    payloadTooLarge: `File ini terlalu besar untuk dikirim (batas ${MAX_UPLOAD_MB} MB). Kecilkan filenya, lalu upload lagi.`,
    // Folders — individual accounts only. A folder is created by typing its name
    // when uploading; it exists as long as a document is in it.
    colFolder: "Folder",
    folderLabel: "Folder (opsional)",
    folderPlaceholder: "Contoh: Riset, Keuangan, Pribadi",
    folderHint: "Dokumen dalam batch ini akan masuk ke folder tersebut. Kosongkan untuk menyimpannya tanpa folder.",
    folderAll: "Semua",
    folderNone: "Tanpa folder",
    folderMoved: "Dokumen dipindahkan.",
    folderMoveFailed: "Gagal memindahkan dokumen.",
    folderEmpty: "Tidak ada dokumen di folder ini.",
    // Individual dashboard: same tabs, different words. "Kelola Dokumen" and
    // "Audit Log" are team vocabulary — nobody audits themselves.
    titleIndividual: "Dashboard Saya",
    tabsIndividual: { documents: "Dokumen Saya", persona: "AI Persona", audit: "Riwayat Pertanyaan" },
    auditTitleIndividual: "Riwayat Pertanyaan",
    auditDescIndividual: "Pertanyaan yang pernah Anda ajukan ke AI.",
    searchAuditIndividual: "Cari pertanyaan...",
    uploadDescIndividual: "Upload catatan, panduan, atau dokumen apa pun dalam format PDF, DOCX, Excel, atau PowerPoint.",
  },
  en: {
    title: "Admin Dashboard",
    tabs: { documents: "Documents", users: "Employees", analytics: "Analytics", persona: "AI Persona", audit: "Audit Log" },
    openChat: "Open Chat",
    logout: "Logout",
    uploadTitle: "Upload Documents",
    uploadDesc: "Upload SOPs, HR regulations, or IT guidelines in PDF, DOCX, Excel, or PowerPoint format.",
    docList: "Document List",
    noDoc: "No documents uploaded yet",
    colName: "File Name",
    colStatus: "Status",
    colDate: "Date",
    colAction: "Action",
    statusSuccess: "Success",
    statusProcessing: "Processing",
    statusFailed: "Failed",
    statusQueued: "Queued",
    aiSummary: "AI Summary",
    addEmployee: "Add Employee",
    noEmployee: "No employees registered yet",
    employees: "employees registered",
    colName2: "Name",
    colEmail: "Email",
    colRole: "Role",
    colJoin: "Joined",
    exportExcel: "Export Excel",
    exportPDF: "Export PDF",
    totalChat: "Total Chat Sessions",
    totalQuestion: "Total Questions",
    totalDoc: "Total Documents",
    totalEmployee: "Total Employees",
    recentQ: "Recent Questions",
    noQuestion: "No questions yet",
    personaTitle: "Custom AI Persona",
    personaDesc: "Customize the identity and personality of your AI assistant.",
    aiName: "AI Assistant Name",
    aiNameHint: "This name appears in the chat header and in AI responses",
    aiNamePlaceholder: "e.g. Ava, Max, Aria, or a name of your own",
    greeting: "Greeting / Welcome Message",
    greetingPlaceholder: "e.g. Hello! I am Ava, the AI assistant at Maju Bersama. How can I help?",
    greetingPlaceholderIndividual: "e.g. Hello! I am Ava. What are we looking for in your documents today?",
    previewGreeting: "Welcome! I am here to help you find information in your company's internal documents.",
    previewGreetingIndividual: "Welcome! I am here to help you find information in your own documents.",
    personality: "Personality Instructions (optional)",
    personalityHint: "Extra instructions to set the AI's style and tone",
    personalityPlaceholder: "e.g. Always answer in a friendly but professional tone. Add a relevant emoji at the end of each answer.",
    savePersona: "Save Persona",
    savingPersona: "Saving...",
    auditTitle: "Audit Log",
    auditDesc: "Monitor who asked what and when.",
    searchAudit: "Search questions or employee name...",
    noAudit: "No audit data yet",
    dropzone: "Drag & drop files here, or click to select",
    dropzoneHint: `PDF, DOCX, XLSX, PPTX · Max. ${MAX_UPLOAD_MB} MB per file`,
    dropzoneActive: "Drop files here...",
    uploadBtn: "Upload",
    uploading: "Uploading...",
    loading: "Loading...",
    loadFailed: "Could not load data. Check your connection, then try again.",
    retry: "Retry",
    fileTooLarge: "File too large",
    fileTooLargeDesc: `exceeds the ${MAX_UPLOAD_MB} MB limit. Upload cancelled.`,
    formatNotSupported: "Format not supported",
    formatNotSupportedDesc: "is not a PDF, DOCX, XLSX, or PPTX file.",
    moreFiles: "more files",
    uploadProgress: "Uploading",
    indexProgress: "Indexing",
    indexWaiting: "Waiting on AI rate limit",
    indexQueued: "Waiting to be indexed",
    indexPaused: "Indexing paused",
    indexPausedDesc: "The AI service is rate limiting us. The remaining documents will be indexed automatically later — or click Resume to try again now.",
    indexElsewhere: "Already being indexed elsewhere",
    indexElsewhereDesc: "This queue is already being worked on — by another tab you still have open, or by the daily background job. Nothing to do; the document list below keeps itself up to date.",
    uploadedCount: "documents uploaded.",
    indexingContinues: "Indexing runs in the background — keep this page open until it finishes.",
    failedPanelTitle: "Files that failed to upload",
    retryFailedBtn: "Retry failed files",
    reindexBtn: "Re-index",
    reindexStarted: "Document is back in the indexing queue.",
    resumeIndexBtn: "Resume",
    reindexFailed: "Could not queue the document.",
    payloadTooLarge: `This file is too large to send (${MAX_UPLOAD_MB} MB limit). Shrink it, then upload again.`,
    colFolder: "Folder",
    folderLabel: "Folder (optional)",
    folderPlaceholder: "e.g. Research, Finance, Personal",
    folderHint: "Documents in this batch go into that folder. Leave it empty to keep them unfiled.",
    folderAll: "All",
    folderNone: "No folder",
    folderMoved: "Document moved.",
    folderMoveFailed: "Could not move the document.",
    folderEmpty: "No documents in this folder.",
    titleIndividual: "My Dashboard",
    tabsIndividual: { documents: "My Documents", persona: "AI Persona", audit: "Question History" },
    auditTitleIndividual: "Question History",
    auditDescIndividual: "The questions you have asked the AI.",
    searchAuditIndividual: "Search questions...",
    uploadDescIndividual: "Upload notes, guides, or any document in PDF, DOCX, Excel, or PowerPoint format.",
  },
} as const;

export const pricing = {
  id: {
    badge: "Harga Transparan, Tanpa Biaya Tersembunyi",
    title: "Pilih Paket yang Tepat untuk Tim Anda",
    subtitle: "Mulai gratis, upgrade ketika siap. Semua paket sudah termasuk enkripsi data dan isolasi multi-tenant.",
    popular: "Paling Populer",
    free: "Gratis",
    forever: "Selamanya",
    perMonth: "per bulan",
    startFree: "Mulai Gratis",
    trialFree: "Berlangganan Sekarang",
    contactSales: "Berlangganan Sekarang",
    customPrice: "Sesuai Kebutuhan",
    customPriceNote: "Harga disepakati bersama",
    contactUs: "Hubungi Kami",
    promoBanner: "🎉 Promo Terbatas — Hemat hingga 37%!",
    promoEnds: "Promo berlaku sampai 31 Desember 2026",
    discountBadge: "PROMO",
    allFeatures: "Semua yang Anda Butuhkan",
    allFeaturesDesc: "Platform lengkap untuk manajemen pengetahuan internal perusahaan",
    faqTitle: "Pertanyaan Umum",
    ctaTitle: "Siap Transformasi Knowledge Base Perusahaan Anda?",
    ctaDesc: "Mulai gratis hari ini. Tidak perlu kartu kredit.",
    ctaBtn: "Mulai Gratis Sekarang",
    signin: "Masuk",
    plans: [
      { name: "Starter", desc: "Untuk tim kecil yang baru memulai" },
      { name: "Professional", desc: "Untuk perusahaan berkembang" },
      { name: "Enterprise", desc: "Untuk perusahaan skala besar" },
      { name: "Custom", desc: "Untuk grup RS, multi-cabang, atau kebutuhan khusus" },
    ],
    features: [
      // Starter searches; it does not get answers. The first five entries are
      // the ones rendered with a tick (see the free-card rule in the pricing
      // page), so everything true of the free plan has to sit above the line and
      // "Chat AI" has to sit below it — this list claimed the opposite until the
      // answers became a paid feature, which would have been a promise the app
      // refuses to keep the moment someone signs up.
      [cap(idLimit(sta.maxEmployees, "karyawan")), cap(idLimit(sta.maxDocuments, "dokumen")), "Pencarian dokumen — temukan & baca kutipan aslinya", "Upload PDF, DOCX, Excel & PowerPoint", "Isolasi data penuh antar perusahaan", "Chat AI: jawaban otomatis lengkap dengan sumber", "Analytics lengkap", "Notifikasi email", "Role per departemen", "Prioritas dukungan"],
      [cap(idLimit(pro.maxEmployees, "karyawan")), cap(idLimit(pro.maxDocuments, "dokumen")), idDaily(proDaily), "Chat AI berbasis RAG", "Upload PDF, DOCX, Excel & PowerPoint", "Analytics lengkap", "Notifikasi email", "Slack integration (segera hadir)", "Role per departemen", "Bisa pakai API key sendiri (BYOK)", "Respon dukungan < 24 jam"],
      [cap(idLimit(ent.maxEmployees, "karyawan")), cap(idLimit(ent.maxDocuments, "dokumen")), idDaily(ent.maxQuestionsPerDay), "Chat AI berbasis RAG", "Upload PDF, DOCX, Excel & PowerPoint", "Analytics lengkap + ekspor", "Notifikasi email", "Slack integration (segera hadir)", "Role per departemen", "Bisa pakai API key sendiri (BYOK)", "Respon dukungan < 8 jam, 24/7"],
      ["Karyawan tanpa batas", "Dokumen tanpa batas", "Pertanyaan tanpa batas", "Semua fitur paket Enterprise", "Skema multi-cabang / multi-unit", "Pakai API key sendiri (BYOK)", "Onboarding & pendampingan langsung", "Perjanjian dan SLA menyesuaikan"],
    ],
    // The Individu tab. Its own arrays rather than extra entries in `plans` /
    // `features` above, because those two are addressed by index — by this page
    // and by the landing page's teaser — and inserting a card in the middle of
    // them silently repoints every card after it at the wrong feature list.
    //
    // Starter's greyed-out items are exactly what Personal adds, which is what
    // the free card's "first five are checked" rule expects: the five above the
    // line are true of the free plan, and everything below it is the upgrade.
    // Folders are not on that line — they are not plan-gated, and putting them
    // there would sell something the free tier already has.
    audienceIndividual: "Individu",
    audienceCompany: "Perusahaan",
    audienceIndividualHint: "Untuk satu orang: dokumen pribadi dan folder sendiri, tanpa kelola karyawan.",
    audienceCompanyHint: "Untuk tim: kelola karyawan, akses per departemen, dan analitik tim.",
    titleIndividual: "Harga untuk Pemakaian Pribadi",
    subtitleIndividual: "Mulai gratis. Naik ke Personal saat dokumen dan pertanyaan Anda bertambah.",
    individualPlans: [
      { name: "Starter", desc: "Untuk mencoba — gratis selamanya" },
      { name: "Personal", desc: "Untuk kebutuhan pribadi sehari-hari" },
    ],
    individualFeatures: [
      ["Pencarian dokumen — temukan & baca kutipan aslinya", cap(idLimit(sta.maxDocuments, "dokumen")), "Upload PDF, DOCX, Excel & PowerPoint", "Folder pribadi untuk merapikan dokumen", "Hanya Anda yang bisa membuka dokumen Anda", "Chat AI: jawaban otomatis lengkap dengan sumber", cap(idLimit(per.maxDocuments, "dokumen")), idPersonalQuota, "Bisa pakai API key sendiri (BYOK)"],
      ["1 pengguna — hanya Anda", cap(idLimit(per.maxDocuments, "dokumen")), idPersonalQuota, "Chat AI berbasis RAG", "Upload PDF, DOCX, Excel & PowerPoint", "Folder pribadi untuk merapikan dokumen", "Tanya khusus satu folder", "Riwayat pertanyaan Anda", "Bisa pakai API key sendiri (BYOK)"],
    ],
    fairUseNote: "",
    faqs: [
      { q: "Apakah data perusahaan saya aman?", a: "Ya. Setiap perusahaan memiliki ruang data yang terisolasi penuh. Dokumen Anda tidak pernah dicampur atau dibagikan ke tenant lain." },
      { q: "Format dokumen apa yang didukung?", a: "Kami mendukung PDF, DOCX, Excel (.xlsx), dan PowerPoint (.pptx)." },
      { q: "Apakah ada batasan pertanyaan?", a: `Jawaban AI tersedia mulai paket berbayar. Paket Starter yang gratis memakai pencarian dokumen — Anda mengetik pertanyaan, sistem menemukan bagian dokumen yang paling relevan, dan Anda membaca kutipan aslinya; yang tidak dilakukan adalah menuliskan jawabannya untuk Anda. Paket Professional dibatasi ${idNum(proDaily)} pertanyaan/hari (untuk menjaga keadilan tim, maksimal ${idNum(proPerUser)} pertanyaan/hari per karyawan). ${idEntQuota} Kalau kebutuhan Anda di atas itu, paket Custom tidak dibatasi — silakan hubungi kami.` },
      { q: "Bagaimana cara upgrade atau downgrade paket?", a: "Anda dapat mengubah paket kapan saja melalui dashboard admin. Perubahan berlaku di awal siklus billing berikutnya." },
      { q: "Apakah ada kontrak jangka panjang?", a: "Tidak. Semua paket berbasis bulanan dan dapat dibatalkan kapan saja tanpa biaya penalti." },
    ],
    featureGrid: [
      { title: "Chat AI Berbasis RAG", desc: "Jawaban akurat dari dokumen internal, bukan dari internet umum" },
      { title: "Multi-Format Dokumen", desc: "Upload PDF, DOCX, Excel & PowerPoint dan ekstrak teks otomatis dengan AI" },
      { title: "Manajemen Tim", desc: "Kelola karyawan, role, dan akses per departemen" },
      { title: "Keamanan Multi-Tenant", desc: "Data tiap perusahaan terisolasi penuh, tidak ada kebocoran" },
      { title: "Analytics & Insight", desc: "Pantau pertanyaan terpopuler dan aktivitas karyawan" },
      { title: "Integrasi Slack", desc: "Tanya langsung dari Slack tanpa buka browser — segera hadir" },
    ],
  },
  en: {
    badge: "Transparent Pricing, No Hidden Fees",
    title: "Choose the Right Plan for Your Team",
    subtitle: "Start free, upgrade when ready. All plans include data encryption and multi-tenant isolation.",
    popular: "Most Popular",
    free: "Free",
    forever: "Forever",
    perMonth: "per month",
    startFree: "Start Free",
    trialFree: "Subscribe Now",
    contactSales: "Subscribe Now",
    customPrice: "Tailored",
    customPriceNote: "Priced with you",
    contactUs: "Contact Us",
    promoBanner: "🎉 Limited Promo — Save up to 37%!",
    promoEnds: "Valid until 31 December 2026",
    discountBadge: "PROMO",
    allFeatures: "Everything You Need",
    allFeaturesDesc: "A complete platform for internal company knowledge management",
    faqTitle: "Frequently Asked Questions",
    ctaTitle: "Ready to Transform Your Company Knowledge Base?",
    ctaDesc: "Start free today. No credit card required.",
    ctaBtn: "Start Free Now",
    signin: "Sign In",
    plans: [
      { name: "Starter", desc: "For small teams just getting started" },
      { name: "Professional", desc: "For growing companies" },
      { name: "Enterprise", desc: "For large-scale organizations" },
      { name: "Custom", desc: "For hospital groups, multi-site, or special requirements" },
    ],
    features: [
      [enLimit(sta.maxEmployees, "employees"), enLimit(sta.maxDocuments, "documents"), "Document search — find and read the original passage", "PDF, DOCX, Excel & PowerPoint upload", "Full data isolation between companies", "AI chat: written answers with their sources", "Full analytics", "Email notifications", "Department roles", "Priority support"],
      [enLimit(pro.maxEmployees, "employees"), enLimit(pro.maxDocuments, "documents"), enDaily(proDaily), "RAG-based AI Chat", "PDF, DOCX, Excel & PowerPoint upload", "Full analytics", "Email notifications", "Slack integration (coming soon)", "Department roles", "Bring your own API key (BYOK)", "Support response < 24h"],
      [enLimit(ent.maxEmployees, "employees"), enLimit(ent.maxDocuments, "documents"), enDaily(ent.maxQuestionsPerDay), "RAG-based AI Chat", "PDF, DOCX, Excel & PowerPoint upload", "Full analytics + export", "Email notifications", "Slack integration (coming soon)", "Department roles", "Bring your own API key (BYOK)", "Support response < 8h, 24/7"],
      ["Unlimited employees", "Unlimited documents", "Unlimited questions", "Everything in Enterprise", "Multi-site / multi-unit setup", "Bring your own API key (BYOK)", "Hands-on onboarding", "Agreement and SLA to fit"],
    ],
    audienceIndividual: "Individual",
    audienceCompany: "Company",
    audienceIndividualHint: "For one person: personal documents and your own folders, no employees to manage.",
    audienceCompanyHint: "For a team: manage employees, department access, and team analytics.",
    titleIndividual: "Pricing for Personal Use",
    subtitleIndividual: "Start free. Move to Personal when your documents and questions outgrow it.",
    individualPlans: [
      { name: "Starter", desc: "To try it out — free forever" },
      { name: "Personal", desc: "For everyday personal use" },
    ],
    individualFeatures: [
      ["Document search — find and read the original passage", enLimit(sta.maxDocuments, "documents"), "PDF, DOCX, Excel & PowerPoint upload", "Personal folders to keep documents tidy", "Only you can open your documents", "AI chat: written answers with their sources", enLimit(per.maxDocuments, "documents"), enPersonalQuota, "Bring your own API key (BYOK)"],
      ["1 user — just you", enLimit(per.maxDocuments, "documents"), enPersonalQuota, "RAG-based AI Chat", "PDF, DOCX, Excel & PowerPoint upload", "Personal folders to keep documents tidy", "Ask within a single folder", "Your question history", "Bring your own API key (BYOK)"],
    ],
    fairUseNote: "",
    faqs: [
      { q: "Is my company data secure?", a: "Yes. Each company has a fully isolated data space. Your documents are never mixed with or shared to other tenants." },
      { q: "What document formats are supported?", a: "We support PDF, DOCX, Excel (.xlsx), and PowerPoint (.pptx)." },
      { q: "Are there question limits?", a: `AI answers start with the paid plans. The free Starter plan uses document search — you type a question, the system finds the passages that match it, and you read the original text; what it does not do is write the answer for you. Professional is limited to ${enNum(proDaily)} questions/day (to keep things fair for the whole team, at most ${enNum(proPerUser)} questions/day per employee). ${enEntQuota} If you need more than that, the Custom plan is uncapped — get in touch.` },
      { q: "How do I upgrade or downgrade my plan?", a: "You can change your plan at any time through the admin dashboard. Changes take effect at the start of the next billing cycle." },
      { q: "Is there a long-term contract?", a: "No. All plans are monthly and can be cancelled at any time without penalty." },
    ],
    featureGrid: [
      { title: "RAG-based AI Chat", desc: "Accurate answers from internal documents, not the general internet" },
      { title: "Multi-Format Documents", desc: "Upload PDF, DOCX, Excel & PowerPoint and auto-extract text with AI" },
      { title: "Team Management", desc: "Manage employees, roles, and department-based access" },
      { title: "Multi-Tenant Security", desc: "Each company's data is fully isolated, no leaks" },
      { title: "Analytics & Insights", desc: "Monitor top questions and employee activity" },
      { title: "Slack Integration", desc: "Ask directly from Slack without opening a browser — coming soon" },
    ],
  },
} as const;
