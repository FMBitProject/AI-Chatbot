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
      if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
    }
  } catch {}
  return undefined;
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
