// Generates one week's content pack with Claude: Senin–Minggu, 2 post per hari,
// untuk LinkedIn + YouTube + Instagram (42 item).
//
//   node scripts/content/generate.mjs [--week 2026-08-10] [--topic "..."]
//                                     [--only linkedin,instagram] [--list-models]
//
// Runs on Gemini's free tier by default — see provider.mjs for why that is safe
// here and how to swap to Claude.
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

import { generateObject, jsonSchema } from "ai";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { buildSystemPrompt } from "./brand-facts.mjs";
import { lintPack, formatProblems, splitProblems } from "./lint.mjs";
import { DAYS, SLOTS, SLOT_IDS, PLATFORMS, PER_PLATFORM, grid } from "./schedule.mjs";
import { resolveModel, listGoogleModels, PROVIDERS } from "./provider.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PACKS_DIR = join(ROOT, "content", "packs");

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
const readEnv = (key) => process.env[key] || fromEnvFile(key);

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};

// Model IDs churn; a 404 on an unknown name is the likeliest first-run failure.
if (args.includes("--list-models")) {
  const key = readEnv(PROVIDERS.google.envKey);
  if (!key) {
    console.error(`${PROVIDERS.google.envKey} tidak diset (cek .env.local).`);
    process.exit(2);
  }
  const models = await listGoogleModels(key);
  console.log(`Model Gemini yang bisa dipakai key ini (${models.length}):\n`);
  for (const m of models) console.log(`  ${m}`);
  console.log(`\nDefault sekarang: ${PROVIDERS.google.defaultModel}`);
  console.log(`Ganti lewat CONTENT_MODEL=<id> di .env.local.`);
  process.exit(0);
}

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
  // Two exclusions. A `.rejected.json` dump is not a published week, so its
  // angles shouldn't count as used (same trap as in push-buffer.mjs). And
  // neither should this same week's earlier attempt — regenerating a week to
  // fix its voice or tone shouldn't also force every angle to change.
  const files = readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".rejected.json") && f !== `${weekOf}.json`)
    .sort()
    .slice(-limit);
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
      body: { type: "string", description: "Isi post, 120-200 kata, TANPA pertanyaan penutup." },
      question: {
        type: "string",
        description: "Satu pertanyaan terbuka penutup, diakhiri tanda tanya. Ini yang memancing komentar.",
      },
    },
    required: ["day", "slot", "angle", "body", "question"],
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
Sabtu & Minggu lebih ringan: satu pengamatan tentang cara kerja tim HR/Ops, atau
satu catatan teknis singkat — bukan edukasi produk, dan BUKAN refleksi pribadi
pendiri (ini halaman perusahaan).`,
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
const { model, providerName, modelId } = resolveModel(readEnv);

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

  let result;
  try {
    result = await generateObject({
      model,
      system: buildSystemPrompt(),
      prompt: userPrompt,
      maxOutputTokens: 32000,
      schema: jsonSchema({
        type: "object",
        properties: {
          theme: { type: "string", description: "Benang merah minggu ini untuk platform ini, satu kalimat." },
          items: { type: "array", items: ITEM_SCHEMAS[platform] },
        },
        required: ["theme", "items"],
        additionalProperties: false,
      }),
    });
  } catch (err) {
    // A wrong/retired model ID is the most common first-run failure, and the
    // raw provider 404 doesn't say what to do about it.
    if (/not found|404|NOT_FOUND/i.test(err.message ?? "")) {
      throw new Error(
        `${platform}: model "${modelId}" tidak ditemukan.` +
          (providerName === "google" ? ` Jalankan \`npm run content:models\` untuk melihat daftar yang valid.` : ""),
      );
    }
    throw new Error(`${platform}: ${err.message}`);
  }

  if (result.finishReason === "length") {
    throw new Error(`${platform}: output terpotong — naikkan maxOutputTokens.`);
  }

  const items = result.object.items ?? [];
  if (platform === "linkedin") {
    // Compose the post from its two parts rather than trusting the model to
    // remember the closing question — asking for it in the prompt produced 0/7
    // on the first real run. Making it a separate required field and joining it
    // here turns "usually ends in a question" into a structural guarantee.
    for (const item of items) {
      const question = (item.question ?? "").trim();
      item.text = question ? `${item.body.trim()}\n\n${question}` : item.body.trim();
    }
  }
  return { platform, ...result.object, items, usage: result.usage };
}

console.log(`Menulis paket minggu ${weekOf} — ${DAYS.length} hari × ${SLOTS.length} slot × ${targets.length} platform = ${PER_PLATFORM * targets.length} item`);
console.log(`Provider ${providerName} / ${modelId}, ${targets.length} panggilan paralel (${targets.join(", ")})...`);
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
  provider: providerName,
  model: modelId,
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

const { blocking, warnings } = splitProblems(lintPack(pack));
if (warnings.length) {
  console.warn(`\n⚠ ${warnings.length} kalimat menyebut klaim terlarang untuk MENYANGKALNYA — dibiarkan lewat, cek sekilas saat baca:`);
  console.warn(formatProblems(warnings, "⚠"));
}
if (blocking.length) {
  const problems = blocking;
  // Dump the rejected pack: without it the only way to see what tripped the
  // lint is to spend another generation, and most rejections need a look at the
  // surrounding sentence to tell a real violation from a rule that's too broad.
  mkdirSync(PACKS_DIR, { recursive: true });
  const rejectedPath = join(PACKS_DIR, `${weekOf}.rejected.json`);
  writeFileSync(rejectedPath, JSON.stringify(pack, null, 2) + "\n");

  console.error("\nPaket DITOLAK — ada klaim yang dilarang:\n");
  console.error(formatProblems(problems));
  console.error(`\nTidak disimpan sebagai paket aktif. Isinya bisa diperiksa di:\n  ${rejectedPath}`);
  console.error("Jalankan ulang; kalau berulang, perketat brand-facts.mjs.");
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
  `> Dibuat ${new Date(pack.generatedAt).toLocaleString("id-ID")} dengan ${pack.provider ?? "?"} / ${pack.model}.`,
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

const sumUsage = (field) => results.reduce((sum, r) => sum + (r.usage?.[field] ?? 0), 0);
const totalIn = sumUsage("inputTokens");
const totalOut = sumUsage("outputTokens");
console.log(`\n✓ Tersimpan:\n  ${join(PACKS_DIR, `${weekOf}.md`)}   <- baca ini\n  ${existingPath}`);
console.log(`  token: ${totalIn} in / ${totalOut} out`);
console.log(`\nLangkah berikutnya: baca ${weekOf}.md, lalu \`npm run content:push\` untuk kirim ${(pack.linkedin ?? []).length} post LinkedIn ke Buffer sebagai draft.`);
