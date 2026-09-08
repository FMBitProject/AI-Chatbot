// Resolusi modul untuk test yang menjalankan file src/*.ts ASLI di bawah
// `node --experimental-strip-types`, tanpa Jest/Vitest dan tanpa bundler.
//
// Kenapa perlu. scripts/pricing.test.mts bisa mengimpor src/lib/pricing.ts
// langsung hanya karena file itu kebetulan tidak punya satu pun `import`.
// Begitu sebuah modul menulis `from "@/lib/..."`, Node berhenti: alias `@/`
// adalah kesepakatan antara tsconfig dan bundler Next, dan resolver Node tidak
// tahu apa-apa soal itu. Akibatnya sebagian besar src/lib tidak bisa diuji
// sama sekali — bukan karena logikanya butuh database, tapi murni karena
// ejaan impornya.
//
// Hook ini menutup jarak itu dengan tiga aturan, semuanya tentang EJAAN
// specifier, bukan tentang mengganti perilaku modul:
//
//   1. "@/x"        → <repo>/src/x(.ts|.tsx|/index.ts)
//   2. "./x"        → ./x.ts  (ESM wajib pakai ekstensi; TypeScript tidak)
//   3. "next/server" dan paket lain yang peta "exports"-nya tidak menyediakan
//      jalur ESM → diresolusi lewat require() lalu diimpor sebagai file.
//
// Yang TIDAK dilakukan hook ini: mem-mock apa pun. Modul yang diimpor adalah
// modul produksi apa adanya. Jadi modul yang membuka koneksi database saat
// dipanggil tetap membuka koneksi database — hook ini membuatnya bisa DIIMPOR,
// bukan otomatis bisa DIUJI sebagai unit.
//
// Dipakai lewat: node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs <file>

import { registerHooks, createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

// "@/lib/db" cocok dengan direktori src/lib/db DAN file src/lib/db/index.ts.
// Ekstensi dicoba lebih dulu supaya direktori tidak pernah menang — kalau
// menang, Node melempar EISDIR yang tidak menyebut-nyebut impor mana pelakunya.
const KANDIDAT = ["", ".ts", ".tsx", ".mts", "/index.ts"];

const cariBerkas = (dasar) => {
  for (const ext of KANDIDAT) {
    const kandidat = dasar + ext;
    if (isFile(kandidat)) return kandidat;
  }
  return null;
};

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const berkas = cariBerkas(resolvePath(ROOT, "src", spec.slice(2)));
      if (berkas) return { url: pathToFileURL(berkas).href, shortCircuit: true };
    }

    try {
      return next(spec, ctx);
    } catch (err) {
      if (ctx.parentURL) {
        if (spec.startsWith(".")) {
          const berkas = cariBerkas(fileURLToPath(new URL(spec, ctx.parentURL)));
          if (berkas) return { url: pathToFileURL(berkas).href, shortCircuit: true };
        } else {
          try {
            const cjs = createRequire(ctx.parentURL).resolve(spec);
            return { url: pathToFileURL(cjs).href, shortCircuit: true };
          } catch {
            // biarkan galat aslinya yang muncul — lebih informatif
          }
        }
      }
      throw err;
    }
  },
});
