// Retired: this historical script used a shared Gemini key and direct SQL,
// bypassing tenant policies, document classification and deletion fencing.
// Stop before reading credentials, connecting to a DB or sending any document.
console.error(
  "Backfill lama dinonaktifkan. Gunakan npm run rag:reindex -- <company-id> " +
  "(dry run), lalu --apply untuk mengantrekan dokumen melalui worker yang " +
  "mematuhi kebijakan privasi. Dokumen tanpa raw_text perlu diunggah ulang.",
);
process.exitCode = 1;
