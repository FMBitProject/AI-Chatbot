// Reads config from the environment, falling back to .env.local.
//
// Same shape as the copy in scripts/content/generate.mjs — deliberately, because
// that copy is the ninth in this directory and unifying them is a chore of its
// own, not something to smuggle into a feature branch. This is the one copy the
// inbox scripts share between themselves.

import { readFileSync } from "fs";
import { join } from "path";

export const ROOT = new URL("../../", import.meta.url).pathname;

function fromEnvFile(key) {
  try {
    const file = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      if (line.slice(0, idx).trim() === key) return unquote(line.slice(idx + 1).trim());
    }
  } catch {}
  return undefined;
}

/**
 * Strips surrounding quotes and interprets \n, the way dotenv does.
 *
 * The other copies of this reader in scripts/ take the raw slice, which is fine
 * for the single-line secrets they read. INBOX_SIGNATURE is the first value here
 * that genuinely needs more than one line, and without this it lands in every
 * outgoing draft as the literal characters `"Salam,\nNama Anda"` — quotes,
 * backslash and all. Escapes are only interpreted inside double quotes so a
 * password containing a backslash still reads back exactly as written.
 */
function unquote(value) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
  }
  return value;
}

export const readEnv = (key) => process.env[key] || fromEnvFile(key);

/** Reads a required key, or exits with a message naming the key and where it goes. */
export function requireEnv(key) {
  const value = readEnv(key);
  if (!value) {
    console.error(`${key} tidak diset (cek .env.local).`);
    console.error(`Lihat scripts/inbox/README.md bagian "Setup".`);
    process.exit(2);
  }
  return value;
}
