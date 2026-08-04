// Generates one week's content pack with Claude: Senin–Minggu, 2 post per hari,
// untuk LinkedIn + YouTube + Instagram (42 item).
//
//   node scripts/content/generate.mjs [--week 2026-08-10] [--topic "..."]
//                                     [--only linkedin,instagram]
//
// Writes two files to content/packs/:
//   <monday>.json  — machine-readable, consumed by push-buffer.mjs
//   <monday>.md    — what you actually read before approving
//
// One API call per platform, run in parallel. 42 items in a single response
// would be a ~20k-token generation where quality drifts badly by the end, and a
// single bad item would mean regenerating all three platforms. Per-platform
// calls stay focused and let you retry just the one that came out wrong.
//
// Packs are committed on purpose: the last few weeks are fed back into the
// prompt so the model stops re-pitching the same angle.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { buildSystemPrompt } from "./brand-facts.mjs";
import { lintPack, formatProblems } from "./lint.mjs";
import { DAYS, SLOTS, SLOT_IDS, PLATFORMS, PER_PLATFORM, grid } from "./schedule.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PACKS_DIR = join(ROOT, "content", "packs");
const MODEL = "claude-opus-5";

function fromEnvFile(key) {
  try {
    const file = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
    }
  } catch {}
  return undefined;
}

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};

function nextMonday(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const daysUntilMonday = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d.toISOString().slice(0, 10);
}

const weekOf = arg("week") ?? nextMonday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
  console.error(`--week harus format YYYY-MM-DD, dapat "${weekOf}"`);
  process.exit(2);
}
const topicHint = arg("topic");
const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
if (only?.some((p) => !PLATFORMS.includes(p))) {
  console.error(`--only hanya menerima: ${PLATFORMS.join(", ")}`);
  process.exit(2);
}
const targets = only ?? PLATFORMS;

// --- what we already published ----------------------------------------------
function recentAngles(limit = 2) {
  if (!existsSync(PACKS_DIR)) return [];
  const files = readdirSync(PACKS_DIR).filter((f) => f.endsWith(".json")).sort().slice(-limit);
  return files.flatMap((f) => {
    try {
      const pack = JSON.parse(readFileSync(join(PACKS_DIR, f), "utf8"));
      return (pack.linkedin ?? []).map((p) => p.angle).filter(Boolean);
    } catch {
      return [];
    }
  });
}

// --- output shapes ----------------------------------------------------------
// Array length can't be constrained by JSON schema here (structured outputs
// doesn't support minItems/maxItems), so the count lives in the prompt and is
// re-checked against the grid in code.
const dayField = { type: "string", enum: DAYS };
const slotField = {
  type: "string",
  enum: SLOT_IDS,
  description: `Slot posting: ${SLOTS.map((s) => `${s.id} (${s.wib} WIB)`).join(", ")}.`,
};

const ITEM_SCHEMAS = {
  linkedin: {
    type: "object",
    properties: {
      day: dayField,
      slot: slotField,
      angle: { type: "string", description: "Sudut pandang post ini, 5-10 kata." },
      text: { type: "string", description: "Isi post lengkap siap posting, 120-200 kata, diakhiri satu pertanyaan terbuka." },
    },
    required: ["day", "slot", "angle", "text"],
    additionalProperties: false,
  },
  youtube: {
    type: "object",
    properties: {
      day: dayField,
      slot: slotField,
      angle: { type: "string", description: "Sudut pandang video ini, 5-10 kata." },
      title: { type: "string", description: "Judul video, maksimal 60 karakter." },
      hook: { type: "string", description: "Kalimat pembuka 3 detik pertama." },
      script: { type: "string", description: "Skrip lengkap untuk dibaca keras, 45-60 detik." },
      description: { type: "string", description: "Deskripsi video YouTube." },
      shotNote: { type: "string", description: "Apa yang perlu terlihat di layar — sekonkret mungkin, ini yang Anda rekam." },
    },
    required: ["day", "slot", "angle", "title", "hook", "script", "description", "shotNote"],
    additionalProperties: false,
  },
  instagram: {
    type: "object",
    properties: {
      day: dayField,
      slot: slotField,
      angle: { type: "string", description: "Sudut pandang post ini, 5-10 kata." },
      caption: { type: "string", description: "Caption 60-100 kata." },
      imageIdea: { type: "string", description: "Visual yang perlu dibuat/difoto — sekonkret mungkin." },
    },
    required: ["day", "slot", "angle", "caption", "imageIdea"],
    additionalProperties: false,
  },
};

// Guidance that only makes sense when a day has more than one slot. Kept
// conditional so changing SLOTS in schedule.mjs doesn't leave the prompt telling
// the model about an evening post that no longer exists.
const MULTI_SLOT_NOTE =
  SLOTS.length > 1
    ? `\nSlot ${SLOTS[0].id} = post utama, lebih substansial. Slot berikutnya lebih ringan dan
pendek — satu observasi atau satu pertanyaan, bukan pengulangan post sebelumnya.`
    : "";

const PLATFORM_BRIEF = {
  linkedin: `${PER_PLATFORM} post LinkedIn, satu per hari.${MULTI_SLOT_NOTE}
Sabtu & Minggu jauh lebih santai: refleksi membangun produk, bukan edukasi produk.`,
  youtube: `${PER_PLATFORM} YouTube Shorts, satu per hari. Satu ide per video, hook di 3
detik pertama.${MULTI_SLOT_NOTE}
Karena videonya direkam manual, tulis shotNote sekonkret mungkin — sebutkan apa
yang terlihat di layar, bukan sekadar "rekam wajah".`,
  instagram: `${PER_PLATFORM} caption Instagram, satu per hari. Lebih personal dan lebih
pendek dari LinkedIn.${MULTI_SLOT_NOTE}
Karena gambarnya dibuat manual, imageIdea harus konkret dan realistis dibuat
sendiri (screenshot produk, teks di latar polos, foto meja kerja) — bukan
ilustrasi yang butuh desainer.`,
};

// --- generate ---------------------------------------------------------------
const apiKey = process.env.ANTHROPIC_API_KEY || fromEnvFile("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY tidak diset (cek .env.local). Ambil di https://console.anthropic.com/settings/keys");
  process.exit(2);
}
const client = new Anthropic({ apiKey });

const previous = recentAngles();
const gridLines = grid().map(({ day, slot }) => `- ${day} / ${slot}`).join("\n");

async function generatePlatform(platform) {
  const userPrompt = [
    `Buat konten ${platform.toUpperCase()} untuk minggu yang dimulai Senin ${weekOf}.`,
    ``,
    PLATFORM_BRIEF[platform],
    ``,
    `Isi TEPAT ${PER_PLATFORM} slot berikut, masing-masing satu item, tanpa ada yang terlewat:`,
    gridLines,
    ``,
    `Seminggu ini boleh punya satu benang merah, tapi tiap item harus berdiri sendiri —`,
    `pembaca hari Kamis belum tentu melihat post hari Senin. Jangan ada dua item yang`,
    `mengulang sudut pandang yang sama.`,
    topicHint ? `\nTopik yang diminta minggu ini: ${topicHint}` : "",
    previous.length
      ? `\nSudut pandang yang SUDAH dipakai minggu-minggu sebelumnya — jangan diulang:\n${previous.map((a) => `- ${a}`).join("\n")}`
      : "",
  ].join("\n");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            theme: { type: "string", description: "Benang merah minggu ini untuk platform ini, satu kalimat." },
            items: { type: "array", items: ITEM_SCHEMAS[platform] },
          },
          required: ["theme", "items"],
          additionalProperties: false,
        },
      },
    },
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error(`${platform}: model menolak permintaan ini.`);
  if (message.stop_reason === "max_tokens") throw new Error(`${platform}: output terpotong — naikkan max_tokens.`);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error(`${platform}: tidak ada teks di respons model.`);
  const parsed = JSON.parse(textBlock.text);
  return { platform, ...parsed, usage: message.usage };
}

console.log(`Menulis paket minggu ${weekOf} — ${DAYS.length} hari × ${SLOTS.length} slot × ${targets.length} platform = ${PER_PLATFORM * targets.length} item`);
console.log(`Model ${MODEL}, ${targets.length} panggilan paralel (${targets.join(", ")})...`);
if (previous.length) console.log(`(menghindari ${previous.length} sudut pandang lama)`);

const settled = await Promise.allSettled(targets.map(generatePlatform));
const failures = settled.filter((r) => r.status === "rejected");
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f.reason.message}`);
  console.error("\nTidak ada yang disimpan. Jalankan ulang, atau pakai --only untuk platform yang gagal saja.");
  process.exit(1);
}
const results = settled.map((r) => r.value);

// --- assemble ---------------------------------------------------------------
const pack = {
  weekOf,
  generatedAt: new Date().toISOString(),
  model: MODEL,
  theme: Object.fromEntries(results.map((r) => [r.platform, r.theme])),
};
for (const r of results) pack[r.platform] = r.items;

// Carry over platforms this run skipped, so --only tops up an existing pack
// instead of quietly deleting the other two thirds of the week.
const existingPath = join(PACKS_DIR, `${weekOf}.json`);
if (only && existsSync(existingPath)) {
  const prior = JSON.parse(readFileSync(existingPath, "utf8"));
  for (const p of PLATFORMS) {
    if (!targets.includes(p) && prior[p]) {
      pack[p] = prior[p];
      pack.theme[p] = prior.theme?.[p] ?? prior.theme;
    }
  }
  console.log(`(menggabungkan dengan paket ${weekOf} yang sudah ada)`);
}

// --- validate ---------------------------------------------------------------
const expected = grid();
let invalid = false;
for (const platform of targets) {
  const items = pack[platform] ?? [];
  const seen = new Set(items.map((i) => `${i.day}/${i.slot}`));
  const missing = expected.filter(({ day, slot }) => !seen.has(`${day}/${slot}`));
  if (items.length !== PER_PLATFORM || missing.length) {
    invalid = true;
    console.error(`✗ ${platform}: ${items.length}/${PER_PLATFORM} item.`);
    if (missing.length) console.error(`  slot kosong: ${missing.map((m) => `${m.day}/${m.slot}`).join(", ")}`);
  }
}
if (invalid) {
  console.error("\nTidak disimpan. Jalankan ulang dengan --only untuk platform yang bermasalah.");
  process.exit(1);
}

const missingQuestion = (pack.linkedin ?? []).filter((p) => !p.text.trimEnd().endsWith("?"));
if (missingQuestion.length) {
  console.warn(`⚠ ${missingQuestion.length} post LinkedIn tidak diakhiri pertanyaan: ${missingQuestion.map((p) => `${p.day}/${p.slot}`).join(", ")}`);
}

const problems = lintPack(pack);
if (problems.length) {
  console.error("\nPaket DITOLAK — ada klaim yang dilarang:\n");
  console.error(formatProblems(problems));
  console.error("\nTidak disimpan. Jalankan ulang; kalau berulang, perketat brand-facts.mjs.");
  process.exit(1);
}

// --- write ------------------------------------------------------------------
mkdirSync(PACKS_DIR, { recursive: true });
writeFileSync(existingPath, JSON.stringify(pack, null, 2) + "\n");

const byDaySlot = (platform, day, slot) =>
  (pack[platform] ?? []).find((i) => i.day === day && i.slot === slot);

const md = [
  `# Konten minggu ${weekOf}`,
  ``,
  ...PLATFORMS.filter((p) => pack.theme?.[p]).map((p) => `**Tema ${p}:** ${pack.theme[p]}`),
  ``,
  `> Dibuat ${new Date(pack.generatedAt).toLocaleString("id-ID")} dengan ${pack.model}.`,
  `> LinkedIn dikirim ke Buffer sebagai draft lewat \`npm run content:push\`.`,
  `> YouTube & Instagram butuh video/gambar dulu — Buffer tidak bisa upload media.`,
  ``,
  `Beban produksi minggu ini: **${(pack.youtube ?? []).length} video** + **${(pack.instagram ?? []).length} gambar**.`,
  ``,
  ...DAYS.flatMap((day) => [
    `---`,
    ``,
    `# ${day}`,
    ...SLOTS.flatMap((slot) => {
      const li = byDaySlot("linkedin", day, slot.id);
      const yt = byDaySlot("youtube", day, slot.id);
      const ig = byDaySlot("instagram", day, slot.id);
      return [
        ``,
        `## ${slot.label} — ${slot.wib} WIB`,
        ...(li ? [``, `### LinkedIn — ${li.angle}`, ``, li.text, ``] : []),
        ...(yt
          ? [
              ``,
              `### YouTube Shorts — ${yt.title}`,
              ``,
              `**Hook:** ${yt.hook}`,
              ``,
              `**Perlu direkam:** ${yt.shotNote}`,
              ``,
              `**Skrip:**`,
              ``,
              yt.script,
              ``,
              `**Deskripsi:**`,
              ``,
              yt.description,
              ``,
            ]
          : []),
        ...(ig
          ? [``, `### Instagram`, ``, `**Perlu dibuat:** ${ig.imageIdea}`, ``, ig.caption, ``]
          : []),
      ];
    }),
  ]),
].join("\n");
writeFileSync(join(PACKS_DIR, `${weekOf}.md`), md);

const totalIn = results.reduce((s, r) => s + r.usage.input_tokens, 0);
const totalOut = results.reduce((s, r) => s + r.usage.output_tokens, 0);
console.log(`\n✓ Tersimpan:\n  ${join(PACKS_DIR, `${weekOf}.md`)}   <- baca ini\n  ${existingPath}`);
console.log(`  token: ${totalIn} in / ${totalOut} out`);
console.log(`\nLangkah berikutnya: baca ${weekOf}.md, lalu \`npm run content:push\` untuk kirim ${(pack.linkedin ?? []).length} post LinkedIn ke Buffer sebagai draft.`);
