// Renders the Instagram text cards for a content pack.
//
//   node scripts/content/render-cards.mjs [--week 2026-08-10]
//
// Instagram refuses a post without media ("Instagram posts require at least one
// image or video"), and Buffer has no upload endpoint — it fetches the image
// from a public URL at publish time. So the cards are written into `public/`
// and served by our own site once main is deployed. No object-storage account,
// no extra API key, and the URL stays alive as long as the site does.
//
// Uses next/og (Satori + resvg), which Next already bundles along with the Geist
// font — so this needs no new dependency and no system font, which the build
// environment doesn't have.
//
// Written with createElement rather than JSX because this is a plain .mjs script
// with no build step.

// "next/og.js", not "next/og": Next's package exports map resolves the bare
// specifier only through its own bundler, and this is a plain Node script.
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { DAYS } from "./schedule.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PACKS_DIR = join(ROOT, "content", "packs");
const PUBLIC_DIR = join(ROOT, "public", "social");

// Square: the safest Instagram feed format, never cropped in the grid.
const SIZE = 1080;

// tailwind teal-600 — the brand colour the app actually uses most.
const TEAL = "#0d9488";
// Footer sits on that teal, so it needs a tint of the *foreground*, not a darker
// teal: teal-800 on teal-600 measures about 1.9:1 and is unreadable at feed size.
const FOOTER = "rgba(255,255,255,0.72)";

// Geist ships inside Next's bundled @vercel/og. Using it avoids adding a font
// file to the repo, and it is the same family the site renders in.
const FONT_PATH = join(ROOT, "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf");

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};

function latestWeek() {
  if (!existsSync(PACKS_DIR)) return undefined;
  const files = readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".rejected.json"))
    .sort();
  return files.length ? files[files.length - 1].replace(/\.json$/, "") : undefined;
}

const weekOf = arg("week") ?? latestWeek();
if (!weekOf) {
  console.error(`Belum ada paket di ${PACKS_DIR}. Jalankan \`npm run content:generate\` dulu.`);
  process.exit(2);
}

const packPath = join(PACKS_DIR, `${weekOf}.json`);
if (!existsSync(packPath)) {
  console.error(`Paket ${weekOf}.json tidak ditemukan.`);
  process.exit(2);
}
const pack = JSON.parse(readFileSync(packPath, "utf8"));
const items = pack.instagram ?? [];
if (!items.length) {
  console.error(`Paket ${weekOf} tidak punya item Instagram.`);
  process.exit(2);
}

if (!existsSync(FONT_PATH)) {
  console.error(`Font tidak ditemukan di ${FONT_PATH}.`);
  console.error("Jalankan `npm install` — font ini ikut dengan Next (next/og).");
  process.exit(2);
}
const font = readFileSync(FONT_PATH);

// Satori supports flexbox only — no grid, and every element that has children
// needs an explicit display:flex. See node_modules/next/dist/docs/…/image-response.md
function card(text) {
  // Long quotes need to shrink or they overflow the square. Rough but stable:
  // Satori has no text-autofit, so size is chosen from length up front.
  const len = text.length;
  const fontSize = len < 60 ? 84 : len < 110 ? 68 : len < 170 ? 54 : 44;

  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: TEAL,
        padding: 90,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flex: 1,
          alignItems: "center",
          color: "#ffffff",
          fontSize,
          lineHeight: 1.3,
          letterSpacing: -1,
        },
      },
      text,
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: FOOTER,
          fontSize: 34,
        },
      },
      h("div", { style: { display: "flex" } }, "IntelliBase"),
      h("div", { style: { display: "flex" } }, "intellibaseai.com"),
    ),
  );
}

// The text printed on the card. cardText is the field the model fills for this
// purpose; imageIdea is a longer art direction note and reads badly as a card,
// so it is only a fallback for packs generated before cardText existed.
function textFor(item) {
  return (item.cardText ?? item.imageIdea ?? "").trim();
}

const outDir = join(PUBLIC_DIR, weekOf);
mkdirSync(outDir, { recursive: true });

console.log(`Merender ${items.length} kartu Instagram untuk minggu ${weekOf}...\n`);

for (const item of items) {
  const text = textFor(item);
  if (!text) {
    console.error(`  ✗ ${item.day}: tidak ada cardText/imageIdea`);
    process.exitCode = 1;
    continue;
  }

  const response = new ImageResponse(card(text), {
    width: SIZE,
    height: SIZE,
    fonts: [{ name: "Geist", data: font, style: "normal", weight: 400 }],
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  // Day index keeps the files in posting order when listed.
  const index = String(DAYS.indexOf(item.day) + 1).padStart(2, "0");
  const filename = `${index}-${item.day.toLowerCase()}.png`;
  writeFileSync(join(outDir, filename), buffer);
  console.log(`  ✓ ${item.day.padEnd(7)} ${filename}  (${Math.round(buffer.length / 1024)} KB)`);
}

console.log(`\nTersimpan di public/social/${weekOf}/`);
console.log(`\nPENTING: commit + push ke main dulu supaya Vercel men-deploy gambarnya.`);
console.log(`Buffer mengambil gambar saat post terbit, jadi URL-nya harus sudah hidup:`);
console.log(`  https://intellibaseai.com/social/${weekOf}/01-senin.png`);
console.log(`\nSetelah ter-deploy, jalankan \`npm run content:push\`.`);
