# Review TODO

- MINOR security (ditunda): `next.config.ts`, `script-src` masih memakai
  `'unsafe-inline'`. Evaluasi nonce/hash beserta dampaknya pada rendering statis.
  CSP tidak diubah pada perbaikan CRITICAL/MEDIUM ini.

- MINOR (ditunda): `src/app/roi/page.tsx`, ternary `isBlue` pada tombol
  `PlanResultCard` (baris 440–442 saat review) memiliki dua hasil class yang
  identik. Sederhanakan pada perubahan terpisah; kode belum diubah dalam
  perbaikan CRITICAL/MEDIUM ini.
