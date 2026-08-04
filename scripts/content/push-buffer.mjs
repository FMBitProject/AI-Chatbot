// Pushes the LinkedIn half of a content pack into Buffer as DRAFTS.
//
//   node scripts/content/push-buffer.mjs --channels        # list channel IDs
//   node scripts/content/push-buffer.mjs                   # push newest pack
//   node scripts/content/push-buffer.mjs --week 2026-08-10
//   node scripts/content/push-buffer.mjs --dry-run
//
// Drafts, not scheduled posts: this is AI-written copy going onto a personal
// founder account, and the whole point of the claim lint is that we do not
// fully trust generated text. You approve in Buffer before anything publishes.
//
// YouTube and Instagram are intentionally NOT pushed. Buffer's API has no media
// upload — assets must already be at a public URL that stays reachable until
// publish time — and neither network accepts a text-only post. Those two live
// in the pack's .md until you have the video/image.
// https://developers.buffer.com/guides/hosting-media.html

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { grid } from "./schedule.mjs";

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
  const files = readdirSync(PACKS_DIR).filter((f) => f.endsWith(".json")).sort();
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

async function pushLinkedIn() {
  const channelId = process.env.BUFFER_LINKEDIN_CHANNEL_ID || fromEnvFile("BUFFER_LINKEDIN_CHANNEL_ID");
  if (!channelId) {
    console.error("BUFFER_LINKEDIN_CHANNEL_ID tidak diset.");
    console.error("Jalankan `npm run content:channels` untuk melihat ID channel Anda.");
    process.exit(2);
  }

  const { file, pack } = loadPack();
  // Post in grid order (Senin pagi → Minggu sore) so the drafts list in Buffer
  // reads in the order you'll publish them, not in whatever order the model emitted.
  const order = new Map(grid().map(({ day, slot }, i) => [`${day}/${slot}`, i]));
  const posts = [...(pack.linkedin ?? [])].sort(
    (a, b) => (order.get(`${a.day}/${a.slot}`) ?? 99) - (order.get(`${b.day}/${b.slot}`) ?? 99),
  );
  const label = (p) => `${p.day}/${p.slot}`.padEnd(14);
  console.log(`Paket ${file} — ${posts.length} post LinkedIn -> Buffer (draft)\n`);

  if (has("dry-run")) {
    for (const p of posts) {
      console.log(`--- ${p.day} ${p.slot} (${p.angle}) ---\n${p.text}\n`);
    }
    console.log("(dry-run: tidak ada yang dikirim)");
    return;
  }

  let ok = 0;
  for (const p of posts) {
    const input = {
      channelId,
      text: p.text,
      // addToQueue + saveToDraft: it lands in the drafts list, not the queue.
      // Nothing publishes until you approve it in Buffer.
      mode: "addToQueue",
      schedulingType: "automatic",
      saveToDraft: true,
      needsApproval: false,
      assets: [],
      aiAssisted: true,
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

  console.log(`\n${ok}/${posts.length} draft dibuat.`);
  if (ok) console.log("Buka https://publish.buffer.com/drafts untuk baca & approve.");
  if (ok < posts.length) process.exitCode = 1;
}

try {
  if (has("channels")) await listChannels();
  else await pushLinkedIn();
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
