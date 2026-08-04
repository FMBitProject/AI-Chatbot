// Mechanical check for claims a generated post must never make.
//
// The prompt in brand-facts.mjs already forbids all of this, but a prompt is a
// request and this is a gate. The failure mode we are guarding against — one
// invented customer or one unmeasured statistic reaching a founder's LinkedIn —
// is exactly the failure mode that already forced a walk-back on the landing
// page, so it gets a check that cannot be talked out of by a persuasive model.
//
// Deliberately biased toward false positives: a rejected pack costs one re-run,
// a published false claim costs the audience's trust.
//
// Standalone:  node scripts/content/lint.mjs [file.json|file.md ...]
// Programmatic: import { lintText, lintPack } from "./lint.mjs"

import { readFileSync } from "fs";
import { currentPrices, formatRupiah } from "./brand-facts.mjs";

const RULES = [
  {
    id: "search-time-stat",
    // The 90% figure from src/lib/roi.ts. It is an internal assumption and may
    // only appear alongside ESTIMATE_NOTE, which social posts have no room for.
    pattern: /\b90\s*%|sembilan puluh persen/i,
    why: "Angka 90% adalah asumsi internal (src/lib/roi.ts), bukan hasil pengukuran. Tidak boleh dipakai di media sosial.",
  },
  {
    id: "speed-claim",
    pattern: /(<|kurang dari|di ?bawah)\s*\d+\s*detik/i,
    why: "Klaim kecepatan belum pernah diukur.",
  },
  {
    id: "used-by",
    pattern: /di(?:pakai|gunakan)\s+(?:oleh|di)\b/i,
    why: 'Belum ada pelanggan. Tulis "cocok untuk", bukan "dipakai oleh".',
  },
  {
    id: "customer-count",
    pattern: /\b\d+\s*\+?\s*(perusahaan|klien|pelanggan|tim|user|pengguna)\b(?![^.]*\bkaryawan\b)/i,
    why: "Menyiratkan jumlah pelanggan. Pelanggan berbayar masih nol.",
  },
  {
    id: "vague-customer-count",
    pattern: /\b(ratusan|puluhan|ribuan|banyak)\s+(perusahaan|klien|pelanggan|tim)\b/i,
    why: "Menyiratkan basis pelanggan yang tidak ada.",
  },
  {
    id: "testimonial",
    pattern: /\btestimoni|kata\s+(Pak|Bu|Bapak|Ibu)\s+\w+|menurut\s+(Pak|Bu|Bapak|Ibu)\s+\w+/i,
    why: "Testimoni/kutipan pelanggan dilarang — tidak ada pelanggan untuk dikutip.",
  },
  {
    id: "absolute-guarantee",
    pattern: /100\s*%\s*(aman|akurat|benar|tepat)|\bdijamin\b|\bgaransi\b/i,
    why: "Jaminan absolut tidak bisa didukung.",
  },
  {
    id: "data-stays-inhouse",
    // The one claim that is actively false: documents do leave, to Gemini and Groq.
    pattern: /(tidak|tak|nggak|ga)\s+(pernah\s+)?(keluar|meninggalkan)\s+(dari\s+)?(perusahaan|kantor|server|infrastruktur)|(tetap|hanya)\s+(di|ada di)\s+(server|infrastruktur)\s+(Anda|perusahaan)/i,
    why: "Salah secara faktual: dokumen dikirim ke Gemini (indexing) dan Groq (jawaban). Lihat brand-facts.mjs.",
  },
];

// Any Rupiah figure in the copy has to be a price we actually charge today.
// Catches the promo/normal drift that would otherwise appear silently in 2027.
function checkPrices(text, now) {
  const p = currentPrices(now);
  const allowed = new Set([
    formatRupiah(p.professional),
    formatRupiah(p.enterprise),
    // Shorthand the landing page also uses.
    `Rp${Math.round(p.professional / 1000)}rb`,
    `Rp${Math.round(p.enterprise / 1000)}rb`,
  ]);
  const found = text.match(/Rp\s?[\d.,]+\s*(rb|ribu|jt|juta)?/gi) ?? [];
  return found
    .map((raw) => raw.replace(/\s+/g, ""))
    .filter((normalized) => !allowed.has(normalized))
    .map((normalized) => ({
      id: "stale-price",
      match: normalized,
      why: `Harga tidak cocok dengan src/lib/pricing.ts hari ini (${[...allowed].join(" / ")}).`,
    }));
}

/** Returns an array of violations; empty array means clean. */
export function lintText(text, now = new Date()) {
  const violations = [];
  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (m) violations.push({ id: rule.id, match: m[0].trim(), why: rule.why });
  }
  violations.push(...checkPrices(text, now));
  return violations;
}

/**
 * Lints a generated pack, reporting which item each violation came from so the
 * message points at "linkedin[1]" rather than at a wall of concatenated text.
 */
export function lintPack(pack, now = new Date()) {
  const problems = [];
  const visit = (where, text) => {
    if (typeof text !== "string" || !text) return;
    for (const v of lintText(text, now)) problems.push({ where, ...v });
  };

  (pack.linkedin ?? []).forEach((post, i) => {
    visit(`linkedin[${i}] (${post.day ?? "?"})`, post.text);
  });
  (pack.youtube ?? []).forEach((v, i) => {
    visit(`youtube[${i}] title`, v.title);
    visit(`youtube[${i}] hook`, v.hook);
    visit(`youtube[${i}] script`, v.script);
    visit(`youtube[${i}] description`, v.description);
  });
  (pack.instagram ?? []).forEach((v, i) => {
    visit(`instagram[${i}] caption`, v.caption);
  });
  return problems;
}

export function formatProblems(problems) {
  return problems
    .map((p) => `  ✗ ${p.where ? p.where + " — " : ""}[${p.id}] "${p.match}"\n      ${p.why}`)
    .join("\n");
}

// --- CLI -------------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node scripts/content/lint.mjs <file.json|file.md> ...");
    process.exit(2);
  }
  let total = 0;
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const problems = file.endsWith(".json")
      ? lintPack(JSON.parse(raw))
      : lintText(raw).map((v) => ({ where: file, ...v }));
    if (problems.length) {
      console.error(`\n${file}:`);
      console.error(formatProblems(problems));
      total += problems.length;
    } else {
      console.log(`✓ ${file} — bersih`);
    }
  }
  if (total > 0) {
    console.error(`\n${total} klaim bermasalah. Perbaiki atau generate ulang.`);
    process.exit(1);
  }
}
