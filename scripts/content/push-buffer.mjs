// Pushes a content pack into Buffer as DRAFTS — LinkedIn and Instagram.
//
//   node scripts/content/push-buffer.mjs --channels        # list channel IDs
//   node scripts/content/push-buffer.mjs                   # push newest pack
//   node scripts/content/push-buffer.mjs --week 2026-08-10
//   node scripts/content/push-buffer.mjs --only linkedin
//   node scripts/content/push-buffer.mjs --dry-run
//
// Drafts, not scheduled posts: this is AI-written copy going onto the company's
// own accounts, and the whole point of the claim lint is that we do not fully
// trust generated text. You approve in Buffer before anything publishes.
//
// Instagram needs its card rendered and deployed FIRST — Buffer has no media
// upload, so it fetches the image from our own site at publish time:
//   npm run content:cards  ->  commit + push to main  ->  npm run content:push
// The push refuses to run if the cards aren't reachable yet.
//
// YouTube is still not pushed: it needs an actual video file, which no amount of
// rendering produces. Its script and metadata live in the pack's .md.
// https://developers.buffer.com/guides/hosting-media.html

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { grid, DAYS } from "./schedule.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PACKS_DIR = join(ROOT, "content", "packs");
const API = "https://api.buffer.com/graphql";

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

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const BUFFER_API_KEY = process.env.BUFFER_API_KEY || fromEnvFile("BUFFER_API_KEY");
if (!BUFFER_API_KEY) {
  console.error("BUFFER_API_KEY tidak diset (cek .env.local).");
  console.error("Ambil di: https://publish.buffer.com/settings/api (harus owner organisasi).");
  process.exit(2);
}

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BUFFER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    // Buffer keys can be created with a 30/90-day expiry, and an expired one
    // looks identical to a typo'd one: a bare 401. Say which it probably is,
    // and that regenerating revokes whatever is currently in .env.local.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Buffer menolak API key (HTTP ${res.status}).\n` +
          `  Kemungkinan: key salah tempel, sudah kedaluwarsa, atau permission-nya kurang.\n` +
          `  Bikin/cek di https://publish.buffer.com/settings/api — ingat, membuat key baru\n` +
          `  langsung mematikan key lama, jadi update BUFFER_API_KEY di .env.local sesudahnya.`,
      );
    }
    throw new Error(`Buffer API HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const body = await res.json();
  // GraphQL reports field/type mistakes here with a 200, so this is the branch
  // that actually catches a wrong query — not the status check above.
  if (body.errors?.length) {
    throw new Error(`Buffer GraphQL error:\n${body.errors.map((e) => "  " + e.message).join("\n")}`);
  }
  return body.data;
}

async function firstOrganizationId() {
  const data = await gql(`query { account { organizations { id name } } }`);
  const orgs = data?.account?.organizations ?? [];
  if (!orgs.length) throw new Error("Tidak ada organisasi di akun Buffer ini.");
  return orgs[0].id;
}

async function listChannels() {
  const organizationId = await firstOrganizationId();
  const data = await gql(
    `query GetChannels($input: ChannelsInput!) {
       channels(input: $input) { id displayName service isQueuePaused }
     }`,
    { input: { organizationId } },
  );
  const channels = data.channels ?? [];
  if (!channels.length) {
    console.log("Belum ada channel yang terhubung di Buffer.");
    return;
  }
  console.log(`\nChannel di organisasi ${organizationId}:\n`);
  for (const c of channels) {
    console.log(`  ${c.service.padEnd(12)} ${c.displayName}`);
    console.log(`  ${"".padEnd(12)} id: ${c.id}${c.isQueuePaused ? "  (antrean dijeda)" : ""}\n`);
  }
  const linkedin = channels.find((c) => c.service?.toLowerCase() === "linkedin");
  if (linkedin) {
    console.log(`Tambahkan ke .env.local:\n  BUFFER_LINKEDIN_CHANNEL_ID=${linkedin.id}`);
  }
}

function loadPack() {
  const week = arg("week");
  if (!existsSync(PACKS_DIR)) {
    console.error(`Belum ada paket di ${PACKS_DIR}. Jalankan \`npm run content:generate\` dulu.`);
    process.exit(2);
  }
  // isPack, not just .json: a rejected dump is `<week>.rejected.json`, which
  // ends in .json and sorts *after* the real pack — picking the newest .json
  // would publish exactly the content the lint refused to save.
  const isPack = (f) => f.endsWith(".json") && !f.endsWith(".rejected.json");
  const files = readdirSync(PACKS_DIR).filter(isPack).sort();
  const file = week ? `${week}.json` : files[files.length - 1];
  if (!file || !existsSync(join(PACKS_DIR, file))) {
    console.error(`Paket ${file ?? "(kosong)"} tidak ditemukan di ${PACKS_DIR}.`);
    process.exit(2);
  }
  return { file, pack: JSON.parse(readFileSync(join(PACKS_DIR, file), "utf8")) };
}

// createPost returns a union, so both branches have to be selected explicitly.
// MutationError comes back as data (HTTP 200, no `errors`) — a push that only
// checked for transport failures would report success on a rejected post.
const CREATE_POST = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id status } }
      ... on MutationError { message }
    }
  }
`;

// Apex redirects 308 to www, so address www directly rather than relying on
// Buffer's fetcher to follow redirects when it pulls the image at publish time.
const ASSET_BASE = process.env.SOCIAL_ASSET_BASE_URL || fromEnvFile("SOCIAL_ASSET_BASE_URL") || "https://www.intellibaseai.com";

const PLATFORMS = {
  linkedin: {
    envKey: "BUFFER_LINKEDIN_CHANNEL_ID",
    text: (item) => item.text,
    // LinkedIn accepts text-only posts, so nothing else is required.
    extra: () => ({ assets: [] }),
  },
  instagram: {
    envKey: "BUFFER_INSTAGRAM_CHANNEL_ID",
    text: (item) => item.caption,
    // Instagram rejects a post without media *and* without a type — verified
    // against the API: "Instagram posts require at least one image or video.,
    // Instagram posts require a type (post, story, or reel)."
    extra: (item, weekOf) => ({
      assets: [{ image: { url: cardUrl(weekOf, item.day) } }],
      metadata: { instagram: { type: "post" } },
    }),
  },
};

function cardUrl(weekOf, day) {
  const index = String(DAYS.indexOf(day) + 1).padStart(2, "0");
  return `${ASSET_BASE}/social/${weekOf}/${index}-${day.toLowerCase()}.png`;
}

/**
 * Buffer fetches the image when the post *publishes*, not when it is created —
 * so a card that hasn't been deployed yet fails silently, days later, with the
 * post already approved. Checking now turns that into an error you can act on.
 */
async function assertCardsLive(items, weekOf) {
  const missing = [];
  for (const item of items) {
    const url = cardUrl(weekOf, item.day);
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (!res.ok) missing.push(`${url} (HTTP ${res.status})`);
    } catch (err) {
      missing.push(`${url} (${err.message})`);
    }
  }
  if (missing.length) {
    throw new Error(
      `Gambar kartu belum bisa diakses publik (${missing.length}/${items.length}):\n` +
        missing.map((m) => `  ${m}`).join("\n") +
        `\n\n  Urutannya: \`npm run content:cards\` -> commit + push ke main ->\n` +
        `  tunggu Vercel selesai deploy -> baru \`npm run content:push\`.\n` +
        `  Buffer mengambil gambar saat post TERBIT, jadi URL-nya harus hidup sampai saat itu.`,
    );
  }
}

async function pushPlatform(name) {
  const platform = PLATFORMS[name];
  const channelId = process.env[platform.envKey] || fromEnvFile(platform.envKey);
  if (!channelId) {
    console.error(`${platform.envKey} tidak diset — ${name} dilewati.`);
    console.error("Jalankan `npm run content:channels` untuk melihat ID channel Anda.");
    return { ok: 0, total: 0, skipped: true };
  }

  const { file, pack } = loadPack();
  // Post in grid order (Senin → Minggu) so the drafts list in Buffer reads in
  // the order you'll publish them, not in whatever order the model emitted.
  const order = new Map(grid().map(({ day, slot }, i) => [`${day}/${slot}`, i]));
  const posts = [...(pack[name] ?? [])].sort(
    (a, b) => (order.get(`${a.day}/${a.slot}`) ?? 99) - (order.get(`${b.day}/${b.slot}`) ?? 99),
  );
  if (!posts.length) {
    console.log(`Paket ${file} tidak punya item ${name}.\n`);
    return { ok: 0, total: 0 };
  }

  const label = (p) => `${p.day}/${p.slot}`.padEnd(14);
  console.log(`Paket ${file} — ${posts.length} post ${name} -> Buffer (draft)\n`);

  if (has("dry-run")) {
    for (const p of posts) {
      console.log(`--- ${p.day} ${p.slot} (${p.angle}) ---\n${platform.text(p)}\n`);
      if (name === "instagram") console.log(`    gambar: ${cardUrl(pack.weekOf, p.day)}\n`);
    }
    console.log("(dry-run: tidak ada yang dikirim)\n");
    return { ok: 0, total: posts.length, dryRun: true };
  }

  if (name === "instagram") await assertCardsLive(posts, pack.weekOf);

  let ok = 0;
  for (const p of posts) {
    const input = {
      channelId,
      text: platform.text(p),
      // addToQueue + saveToDraft: it lands in the drafts list, not the queue.
      // Nothing publishes until you approve it in Buffer.
      mode: "addToQueue",
      schedulingType: "automatic",
      saveToDraft: true,
      needsApproval: false,
      aiAssisted: true,
      ...platform.extra(p, pack.weekOf),
    };
    const data = await gql(CREATE_POST, { input });
    const result = data.createPost;
    if (result.__typename === "PostActionSuccess") {
      console.log(`  ✓ ${label(p)} draft ${result.post.id} (${result.post.status})`);
      ok++;
    } else {
      console.error(`  ✗ ${label(p)} ditolak Buffer: ${result.message}`);
    }
  }

  console.log(`\n${ok}/${posts.length} draft ${name} dibuat.\n`);
  return { ok, total: posts.length };
}

try {
  if (has("channels")) {
    await listChannels();
  } else {
    // --only linkedin / --only instagram to push one platform at a time.
    const only = arg("only");
    const targets = only ? only.split(",").map((s) => s.trim()) : Object.keys(PLATFORMS);
    const unknown = targets.filter((t) => !PLATFORMS[t]);
    if (unknown.length) {
      console.error(`--only tidak mengenal: ${unknown.join(", ")}. Pilihan: ${Object.keys(PLATFORMS).join(", ")}`);
      process.exit(2);
    }

    let ok = 0;
    let total = 0;
    for (const name of targets) {
      const r = await pushPlatform(name);
      ok += r.ok;
      total += r.total;
    }
    if (ok) console.log("Buka https://publish.buffer.com/drafts untuk baca & approve.");
    if (total && ok < total) process.exitCode = 1;
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
