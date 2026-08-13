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

// Words that flip a match from "making the claim" to "refusing to make it".
// The founder voice deliberately says things like "kami tidak mencantumkan
// testimoni palsu" and "kami tidak mengklaim 100% aman" — good, on-brand copy
// that a keyword-only check rejects. Matches inside a negated sentence are
// downgraded to warnings rather than blocking the pack.
const NEGATORS =
  /\b(tidak|tak|bukan|tanpa|menolak|tolak|jangan|hindari|belum|palsu|mengada-ada|bohong|klaim kosong|no fake)\b/i;

// The window negation is judged in: the sentence containing the match, plus the
// one after it. The refusal usually lands in the *next* sentence — "...mengklaim
// dipakai oleh ratusan tim. Saya menolak semua itu." — so a single-sentence
// window misses the most common shape. Kept to two sentences so a "tidak" from
// elsewhere in the post can't excuse a claim; and because a negated match is
// still printed as a warning, erring wide costs a glance, not a bad post.
function nextMark(text, from) {
  const positions = [".", "\n", "?", "!"]
    .map((m) => text.indexOf(m, from))
    .filter((i) => i !== -1);
  return positions.length ? Math.min(...positions) : -1;
}

function sentenceAround(text, index) {
  const start = Math.max(0, text.lastIndexOf(".", index), text.lastIndexOf("\n", index), text.lastIndexOf("?", index));
  const firstEnd = nextMark(text, index);
  if (firstEnd === -1) return text.slice(start);
  const secondEnd = nextMark(text, firstEnd + 1);
  return text.slice(start, (secondEnd === -1 ? text.length : secondEnd) + 1);
}

const RULES = [
  {
    id: "search-time-stat",
    // The old 90% headline is gone from src/lib/roi.ts, but it survives in every
    // draft the model has read, so the rule outlives the number. What replaced
    // it (~28%, after three discounts) still may only appear alongside
    // ESTIMATE_NOTE, which social posts have no room for.
    pattern: /\b90\s*%|sembilan puluh persen/i,
    why: "Angka 90% sudah tidak dipakai di mana pun — kalkulator ROI sekarang memakai model yang jauh lebih konservatif. Klaim penghematan berbasis asumsi tidak boleh dipakai di media sosial tanpa catatan estimasi.",
  },
  {
    id: "speed-claim",
    pattern: /(<|kurang dari|di ?bawah)\s*\d+\s*detik/i,
    why: "Klaim kecepatan belum pernah diukur.",
  },
  {
    id: "used-by",
    // Only an adoption claim about someone else. "digunakan di kantor Anda" is
    // addressed to the reader — that is a question about them, not a claim
    // about our customers, and it is normal copy.
    pattern: /di(?:pakai|gunakan)\s+(?:oleh|di)\s+(?!(?:\w+\s+)?Anda\b)/i,
    why: 'Belum ada pelanggan. Tulis "cocok untuk", bukan "dipakai oleh".',
  },
  {
    id: "customer-count",
    // Must be an *adoption* claim, not any number next to a business noun.
    // "5 pengguna" is the Starter plan limit and is explicitly allowed, so the
    // rule keys on the adoption verb and excludes nouns that appear in plan
    // limits (pengguna/user/tim). An earlier, broader version rejected our own
    // approved pricing copy on the first real run.
    pattern:
      /(sudah|telah|lebih dari|sekitar|hampir|bergabung|mempercayai|dipercaya|melayani)\s+(oleh\s+)?\d+\s*\+?\s*(perusahaan|klien|pelanggan|bisnis)\b|\b\d+\s*\+?\s*(perusahaan|klien|pelanggan|bisnis)\s+(sudah|telah|kami|mempercayai|bergabung)/i,
    why: "Menyiratkan jumlah pelanggan. Pelanggan berbayar masih nol.",
  },
  {
    id: "vague-customer-count",
    // Needs an adoption verb, same as customer-count. Describing the market —
    // "di banyak perusahaan skala 20-200 karyawan", "banyak tim HR ragu
    // berinvestasi" — is normal, useful copy and says nothing about who our
    // customers are. Only a usage claim about those companies is a problem.
    pattern:
      /\b(ratusan|puluhan|ribuan|banyak)\s+(perusahaan|klien|pelanggan|tim)\s+(sudah|telah|kami|mempercayai|memakai|menggunakan|berlangganan)\b|\b(di(?:pakai|gunakan|percaya)|melayani|berlangganan)\s+(oleh\s+)?(ratusan|puluhan|ribuan|banyak)\s+(perusahaan|klien|pelanggan|tim)\b/i,
    why: "Menyiratkan basis pelanggan yang tidak ada.",
  },
  {
    id: "founder-voice",
    // The LinkedIn channel is a company page, not a personal profile, so
    // first-person singular is always wrong there — "Saya membangun IntelliBase"
    // reads as if the company account were one person. Caught mechanically
    // because the first real pack was full of it and it reads plausibly enough
    // to slip past a skim.
    pattern: /\bsaya\b|\bsebagai\s+(seorang\s+)?(pendiri|founder)\b|\bperjalanan\s+saya\b/i,
    why: 'Ini halaman perusahaan, bukan profil pribadi. Pakai "kami", jangan "saya"/"sebagai pendiri".',
    // "tidak" nearby shouldn't excuse it — the voice is wrong either way.
    negationAware: false,
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
    // The pattern already contains the negation ("tidak keluar"), so negation
    // handling would exempt this rule from itself. Always blocking.
    negationAware: false,
  },
  {
    id: "plan-enumeration",
    // Personal and Professional/Enterprise are sold to different account types:
    // isPlanAllowedFor() in src/lib/pricing.ts refuses a company account
    // Personal, and refuses an individual account everything else. So no reader
    // can ever choose from a list containing both, and a sentence offering one
    // describes a product we do not sell.
    //
    // Keyed on the *enumeration* rather than on any one feature claim, which is
    // what makes it work. The bug that prompted this rule read "Ini fitur di
    // paket berbayar (Personal, Professional, Enterprise)" — the feature it was
    // wrongly granting (Slack) was named two sentences earlier and referred to
    // here only as "Ini", so every rule shaped as "Slack near Personal" missed
    // it entirely. The impossible plan list is the part that is always present,
    // and it carries any other feature claim just as wrongly.
    pattern:
      /\bPersonal\b\s*[,/&]\s*(dan\s+)?Professional|\bProfessional\b\s*[,/&]\s*(dan\s+)?Personal|\bPersonal\b\s+dan\s+(Professional|Enterprise)/i,
    why: "Personal hanya untuk akun Individu; Professional/Enterprise hanya untuk akun Perusahaan (isPlanAllowedFor di src/lib/pricing.ts). Tidak ada pembaca yang bisa memilih dari daftar berisi keduanya — pisahkan per audiens.",
    // The negation window cannot tell *what* a "bukan" refers to, and that is
    // not hypothetical here: the sentence that shipped this bug ended "...,
    // bukan biaya tambahan terpisah", negating the fee rather than the plan
    // list, which downgraded a real error to a warning nobody would act on.
    // Nothing correct enumerates these tiers together — copy that needs to name
    // both splits them by audience, the way the pricing page does — so there is
    // no legitimate sentence for negation-awareness to protect.
    negationAware: false,
  },
];

// Any Rupiah figure in the copy has to be a price we actually charge today.
// Catches the promo/normal drift that would otherwise appear silently in 2027.
function checkPrices(text, now) {
  const p = currentPrices(now);
  const allowed = new Set([
    formatRupiah(p.personal),
    formatRupiah(p.professional),
    formatRupiah(p.enterprise),
    // Shorthand the landing page also uses.
    `Rp${Math.round(p.personal / 1000)}rb`,
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

/**
 * Returns violations; empty array means clean. Each carries `negated: true`
 * when the match sits in a sentence that refuses the claim — callers treat
 * those as warnings to eyeball rather than reasons to reject the pack.
 */
export function lintText(text, now = new Date()) {
  const violations = [];
  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (!m) continue;
    const negated =
      rule.negationAware !== false && NEGATORS.test(sentenceAround(text, m.index ?? 0));
    violations.push({ id: rule.id, match: m[0].trim(), why: rule.why, negated });
  }
  violations.push(...checkPrices(text, now).map((v) => ({ ...v, negated: false })));
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

  // Label by day/slot rather than array index — with 14 items per platform,
  // "linkedin[9]" tells you nothing about which post to go fix.
  const at = (platform, item, i) =>
    `${platform} ${item.day ?? "?"}/${item.slot ?? `#${i}`}`;

  (pack.linkedin ?? []).forEach((p, i) => visit(at("linkedin", p, i), p.text));
  (pack.youtube ?? []).forEach((v, i) => {
    const w = at("youtube", v, i);
    visit(`${w} title`, v.title);
    visit(`${w} hook`, v.hook);
    visit(`${w} script`, v.script);
    visit(`${w} description`, v.description);
  });
  (pack.instagram ?? []).forEach((v, i) => visit(at("instagram", v, i), v.caption));
  return problems;
}

/** Splits lint output into blocking violations and negated matches to eyeball. */
export function splitProblems(problems) {
  return {
    blocking: problems.filter((p) => !p.negated),
    warnings: problems.filter((p) => p.negated),
  };
}

export function formatProblems(problems, mark = "✗") {
  return problems
    .map((p) => `  ${mark} ${p.where ? p.where + " — " : ""}[${p.id}] "${p.match}"\n      ${p.why}`)
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
    const { blocking, warnings } = splitProblems(problems);
    if (blocking.length) {
      console.error(`\n${file}:`);
      console.error(formatProblems(blocking));
      total += blocking.length;
    } else {
      console.log(`✓ ${file} — bersih`);
    }
    if (warnings.length) {
      console.warn(`\n${file} — kalimat menyangkal klaim (cek sekilas, tidak memblokir):`);
      console.warn(formatProblems(warnings, "⚠"));
    }
  }
  if (total > 0) {
    console.error(`\n${total} klaim bermasalah. Perbaiki atau generate ulang.`);
    process.exit(1);
  }
}
