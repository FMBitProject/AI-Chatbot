// Applies drizzle/0004_row_level_security.sql directly, bypassing drizzle-kit's
// migration journal. Needed on schema-only Neon branches: their
// __drizzle_migrations table is empty (schema-only copies structure, not rows),
// so `drizzle-kit migrate` tries to re-run 0000 from scratch, hits
// "relation already exists", and never reaches 0004.
//
// Use for THROWAWAY VERIFICATION BRANCHES ONLY. On production the journal is
// intact, so apply 0004 there the normal way: npm run db:migrate.
//
//   DATABASE_URL=<branch-url> node scripts/apply-rls-sql.mjs
import { neon } from "@neondatabase/serverless";
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

const sql = neon(DATABASE_URL);
const file = readFileSync(new URL("../drizzle/0004_row_level_security.sql", import.meta.url), "utf8");

// The migration is one statement per `--> statement-breakpoint`; comment-only
// segments (the header) are skipped.
const statements = file
  .split("--> statement-breakpoint")
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

console.log(`Applying ${statements.length} statements from 0004_row_level_security.sql…`);
for (const stmt of statements) {
  console.log(`  ${stmt.split("\n")[0].slice(0, 70)}…`);
  await sql.query(stmt);
}
console.log("Done. Now run: DATABASE_URL=<same-url> node scripts/verify-rls.mjs");
