// One-time backfill: encrypts the BYOK provider keys already sitting in
// `companies.groq_api_key` / `companies.gemini_api_key` as plaintext.
//
//   DATABASE_URL=<owner-url> BYOK_SECRET_KEY=<base64> node scripts/encrypt-byok-keys.mjs --dry-run
//   DATABASE_URL=<owner-url> BYOK_SECRET_KEY=<base64> node scripts/encrypt-byok-keys.mjs
//
// Both variables fall back to .env.local, like the other operator scripts here.
//
// Why a script and not a SQL migration. The obvious move is pgcrypto inside a
// numbered migration, the way 0003_hash_api_keys.sql hashed the customer API
// keys. It is the wrong tool twice over: the master key would have to appear as
// a literal in the migration file, which is version-controlled and echoed into
// deploy logs, and pgcrypto's AES has no AEAD mode, so the ciphertext would
// carry no authentication tag and none of the company/column binding that
// @/lib/secret-box relies on. Doing it here keeps the key in the environment and
// produces exactly the same format the app reads.
//
// Safe to run more than once. Rows already in the "v1:" format are skipped, so a
// half-finished run — an interrupted connection, a laptop closing — is resumed
// by running it again rather than double-encrypting what it already did.
//
// Ordering against the deploy does not matter. `decryptSecret` returns anything
// that is not in our format unchanged, so plaintext rows keep working after the
// code ships and before this runs; and the app writes ciphertext from the moment
// it deploys, which this script then leaves alone. Either order works, and there
// is no window where a BYOK customer's chat is broken.
import { neon } from "@neondatabase/serverless";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { readFileSync } from "fs";

function fromEnvFile(key) {
  try {
    const file = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
    }
  } catch {}
  return undefined;
}

const DATABASE_URL = process.env.DATABASE_URL || fromEnvFile("DATABASE_URL");
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const SECRET = process.env.BYOK_SECRET_KEY || fromEnvFile("BYOK_SECRET_KEY");
if (!SECRET) throw new Error("BYOK_SECRET_KEY not set — generate with `openssl rand -base64 32`");

const MASTER = Buffer.from(SECRET, "base64");
if (MASTER.length !== 32) {
  throw new Error(`BYOK_SECRET_KEY must decode to 32 bytes, got ${MASTER.length}`);
}

const dryRun = process.argv.includes("--dry-run");

// Deliberately duplicated from src/lib/secret-box.ts rather than imported: this
// is a .mjs operator script and that module is TypeScript compiled by Next.
// The duplication is what `verify` below defends against — every value is
// decrypted back and compared to the original before it is written, so a format
// that has drifted from the app's fails here instead of in production.
const SCHEME = "v1";

function encrypt(plaintext, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", MASTER, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [SCHEME, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

function decrypt(stored, context) {
  const [, ivB64, tagB64, ctB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", MASTER, Buffer.from(ivB64, "base64"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

function isEncrypted(value) {
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === SCHEME;
}

const sql = neon(DATABASE_URL);

const rows = await sql`
  SELECT id, name, groq_api_key, gemini_api_key
  FROM companies
  WHERE groq_api_key IS NOT NULL OR gemini_api_key IS NOT NULL
  ORDER BY created_at
`;

if (rows.length === 0) {
  console.log("No company has a provider key stored. Nothing to do.");
  process.exit(0);
}

console.log(`${rows.length} company row(s) hold at least one key.${dryRun ? "  [DRY RUN]" : ""}\n`);

let encrypted = 0;
let skipped = 0;

for (const row of rows) {
  const updates = {};

  for (const [column, field] of [
    ["groq_api_key", "groqApiKey"],
    ["gemini_api_key", "geminiApiKey"],
  ]) {
    const value = row[column];
    if (!value) continue;
    if (isEncrypted(value)) {
      skipped++;
      console.log(`  skip   ${row.name} · ${field} (already encrypted)`);
      continue;
    }

    // The AAD must match @/lib/byok exactly — `<companyId>:<camelCaseField>`,
    // using the Drizzle property name and not the snake_case column. Getting
    // this wrong produces ciphertext that stores fine and fails to decrypt on
    // the first question asked, which is why it is verified immediately below.
    const context = `${row.id}:${field}`;
    const sealed = encrypt(value, context);

    if (decrypt(sealed, context) !== value) {
      throw new Error(`Round-trip verification failed for ${row.name} · ${field}. Nothing further was written.`);
    }

    updates[column] = sealed;
    encrypted++;
    console.log(`  encrypt ${row.name} · ${field} (${value.length} chars → ${sealed.length})`);
  }

  if (dryRun || Object.keys(updates).length === 0) continue;

  // One statement per row, both columns at once, so a row is never left half
  // encrypted. neon()'s tagged template does not interpolate identifiers, hence
  // the two explicit branches rather than a built string.
  if (updates.groq_api_key && updates.gemini_api_key) {
    await sql`UPDATE companies SET groq_api_key = ${updates.groq_api_key}, gemini_api_key = ${updates.gemini_api_key} WHERE id = ${row.id}`;
  } else if (updates.groq_api_key) {
    await sql`UPDATE companies SET groq_api_key = ${updates.groq_api_key} WHERE id = ${row.id}`;
  } else {
    await sql`UPDATE companies SET gemini_api_key = ${updates.gemini_api_key} WHERE id = ${row.id}`;
  }
}

console.log(
  `\n${dryRun ? "Would encrypt" : "Encrypted"} ${encrypted} key(s); skipped ${skipped} already-encrypted.`,
);
if (dryRun) console.log("Re-run without --dry-run to apply.");
