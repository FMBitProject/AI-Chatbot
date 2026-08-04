// Generates one week's content pack (Senin/Selasa/Rabu) with Claude.
//
//   node scripts/content/generate.mjs [--week 2026-08-10] [--topic "..."]
//
// Writes two files to content/packs/:
//   <monday>.json  — machine-readable, consumed by push-buffer.mjs
//   <monday>.md    — what you actually read before approving
//
// Packs are committed on purpose: the last few weeks are fed back into the
// prompt so the model stops re-pitching the same angle every Monday.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { buildSystemPrompt } from "./brand-facts.mjs";
import { lintPack, formatProblems } from "./lint.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PACKS_DIR = join(ROOT, "content", "packs");
const MODEL = "claude-opus-5";

// --- env, with the .env.local fallback the other scripts in this repo use ----
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
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}

// Defaults to the Monday of next week — you generate on Fri/Sat for the week ahead.
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

// --- what we already published ----------------------------------------------
// Only the angles, not the full text: enough for the model to avoid repeating
// itself without spending the context window on four weeks of prose.
function recentAngles(limit = 4) {
  if (!existsSync(PACKS_DIR)) return [];
  const files = readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(-limit);
  return files.flatMap((f) => {
    try {
      const pack = JSON.parse(readFileSync(join(PACKS_DIR, f), "utf8"));
      return (pack.linkedin ?? []).map((p) => `${pack.weekOf ?? f}: ${p.angle}`);
    } catch {
      return [];
    }
  });
}

// --- output shape -----------------------------------------------------------
// Note: JSON-schema array length constraints are not supported by structured
// outputs, so the "exactly 3" requirement lives in the prompt and is re-checked
// in code below.
const DAYS = ["Senin", "Selasa", "Rabu"];

const PACK_SCHEMA = {
  type: "object",
  properties: {
    theme: {
      type: "string",
      description: "Benang merah minggu ini dalam satu kalimat pendek.",
    },
    linkedin: {
      type: "array",
      description: "Tepat 3 post, satu untuk Senin, Selasa, Rabu (berurutan).",
      items: {
        type: "object",
        properties: {
          day: { type: "string", enum: DAYS },
          angle: { type: "string", description: "Sudut pandang post ini, 5-10 kata." },
          text: { type: "string", description: "Isi post lengkap, siap posting, 120-200 kata, diakhiri satu pertanyaan terbuka." },
        },
        required: ["day", "angle", "text"],
        additionalProperties: false,
      },
    },
    youtube: {
      type: "array",
      description: "Tepat 3 YouTube Shorts.",
      items: {
        type: "object",
        properties: {
          day: { type: "string", enum: DAYS },
          title: { type: "string", description: "Judul video, maksimal 60 karakter." },
          hook: { type: "string", description: "Kalimat pembuka 3 detik pertama." },
          script: { type: "string", description: "Skrip lengkap untuk dibaca, 45-60 detik." },
          description: { type: "string", description: "Deskripsi video YouTube." },
          shotNote: { type: "string", description: "Petunjuk singkat apa yang perlu terlihat di layar." },
        },
        required: ["day", "title", "hook", "script", "description", "shotNote"],
        additionalProperties: false,
      },
    },
    instagram: {
      type: "array",
      description: "Tepat 3 caption Instagram.",
      items: {
        type: "object",
        properties: {
          day: { type: "string", enum: DAYS },
          caption: { type: "string", description: "Caption 60-100 kata." },
          imageIdea: { type: "string", description: "Ide visual yang perlu dibuat/difoto." },
        },
        required: ["day", "caption", "imageIdea"],
        additionalProperties: false,
      },
    },
  },
  required: ["theme", "linkedin", "youtube", "instagram"],
  additionalProperties: false,
};

// --- generate ---------------------------------------------------------------
const apiKey = process.env.ANTHROPIC_API_KEY || fromEnvFile("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY tidak diset (cek .env.local). Ambil di https://console.anthropic.com/settings/keys");
  process.exit(2);
}
const client = new Anthropic({ apiKey });

const previous = recentAngles();
const userPrompt = [
  `Buat paket konten untuk minggu yang dimulai Senin ${weekOf}.`,
  "",
  "Isinya: 3 post LinkedIn (Senin, Selasa, Rabu), 3 skrip YouTube Shorts, dan 3 caption Instagram.",
  "Ketiga hari boleh saling menyambung sebagai satu tema, tapi tiap post harus berdiri sendiri —",
  "pembaca Selasa belum tentu lihat post Senin.",
  "",
  "Untuk YouTube dan Instagram: videonya dan gambarnya dibuat manual, jadi tulis juga",
  "petunjuk singkat apa yang perlu direkam/difoto.",
  topicHint ? `\nTopik yang diminta minggu ini: ${topicHint}` : "",
  previous.length
    ? `\nSudut pandang yang SUDAH dipakai di minggu-minggu sebelumnya — jangan diulang:\n${previous.map((a) => `- ${a}`).join("\n")}`
    : "",
].join("\n");

console.log(`Menulis paket untuk minggu ${weekOf} dengan ${MODEL}...`);
if (previous.length) console.log(`(menghindari ${previous.length} sudut pandang lama)`);

// Streaming: thinking is on by default on Opus 5 and counts against max_tokens,
// so a non-streaming call at this budget risks an HTTP timeout.
const stream = client.messages.stream({
  model: MODEL,
  max_tokens: 32000,
  system: buildSystemPrompt(),
  messages: [{ role: "user", content: userPrompt }],
  output_config: { format: { type: "json_schema", schema: PACK_SCHEMA } },
});
const message = await stream.finalMessage();

if (message.stop_reason === "refusal") {
  console.error("Model menolak permintaan ini. Ubah topik lalu coba lagi.");
  process.exit(1);
}
if (message.stop_reason === "max_tokens") {
  console.error("Output terpotong (max_tokens). Naikkan max_tokens di generate.mjs.");
  process.exit(1);
}

const textBlock = message.content.find((b) => b.type === "text");
if (!textBlock) {
  console.error("Tidak ada teks di respons model.");
  process.exit(1);
}
const pack = { weekOf, generatedAt: new Date().toISOString(), model: MODEL, ...JSON.parse(textBlock.text) };

// --- validate ---------------------------------------------------------------
for (const key of ["linkedin", "youtube", "instagram"]) {
  if (pack[key]?.length !== 3) {
    console.error(`Model mengembalikan ${pack[key]?.length ?? 0} item untuk "${key}", harusnya 3. Jalankan ulang.`);
    process.exit(1);
  }
}

// Every LinkedIn post is supposed to end in a question — that is the whole
// discovery-interview mechanic, and it is cheap to check.
const missingQuestion = pack.linkedin.filter((p) => !p.text.trimEnd().endsWith("?"));
if (missingQuestion.length) {
  console.warn(`⚠ ${missingQuestion.length} post LinkedIn tidak diakhiri pertanyaan (${missingQuestion.map((p) => p.day).join(", ")}).`);
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
const jsonPath = join(PACKS_DIR, `${weekOf}.json`);
const mdPath = join(PACKS_DIR, `${weekOf}.md`);

writeFileSync(jsonPath, JSON.stringify(pack, null, 2) + "\n");

const md = [
  `# Konten minggu ${weekOf}`,
  ``,
  `**Tema:** ${pack.theme}`,
  ``,
  `> Dibuat ${new Date(pack.generatedAt).toLocaleString("id-ID")} dengan ${pack.model}.`,
  `> LinkedIn dikirim ke Buffer sebagai draft lewat \`npm run content:push\`.`,
  `> YouTube & Instagram butuh video/gambar dulu — Buffer tidak bisa upload media.`,
  ``,
  `## LinkedIn`,
  ...pack.linkedin.flatMap((p) => [``, `### ${p.day} — ${p.angle}`, ``, p.text, ``]),
  `## YouTube Shorts`,
  ...pack.youtube.flatMap((v) => [
    ``,
    `### ${v.day} — ${v.title}`,
    ``,
    `**Hook:** ${v.hook}`,
    ``,
    `**Perlu direkam:** ${v.shotNote}`,
    ``,
    `**Skrip:**`,
    ``,
    v.script,
    ``,
    `**Deskripsi:**`,
    ``,
    v.description,
    ``,
  ]),
  `## Instagram`,
  ...pack.instagram.flatMap((v) => [
    ``,
    `### ${v.day}`,
    ``,
    `**Perlu dibuat:** ${v.imageIdea}`,
    ``,
    v.caption,
    ``,
  ]),
].join("\n");
writeFileSync(mdPath, md);

const usage = message.usage;
console.log(`\n✓ Tersimpan:\n  ${mdPath}   <- baca ini\n  ${jsonPath}`);
console.log(`  token: ${usage.input_tokens} in / ${usage.output_tokens} out`);
console.log(`\nLangkah berikutnya: baca ${weekOf}.md, lalu \`npm run content:push\` untuk kirim LinkedIn ke Buffer sebagai draft.`);
