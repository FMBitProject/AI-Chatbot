// Creates a dedicated login role for the app WITHOUT the BYPASSRLS attribute.
//
// Why: Neon roles created via the console (like neondb_owner) are members of
// neon_superuser, which carries BYPASSRLS — such roles ignore row-level
// security entirely, FORCE or not. For the RLS policies in 0004 to actually
// bite, the app must connect as a plain SQL-created role. Roles created via
// SQL (like this one) do NOT get neon_superuser.
//
// Run with the OWNER connection string; it prints the new role's connection
// string to use for the app / verify-rls:
//   DATABASE_URL=<owner-url> node scripts/create-rls-role.mjs
//
// Idempotent-ish: if the role already exists it just resets the password and
// re-grants.
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
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

const ROLE = "app_rls";
// URL-safe password so it can be pasted into a connection string as-is.
const password = randomBytes(24).toString("base64url");

const sql = neon(DATABASE_URL);

const [{ exists }] = await sql.query(
  `select exists(select 1 from pg_roles where rolname = $1) as exists`, [ROLE]);

if (exists) {
  console.log(`Role ${ROLE} already exists — resetting password and re-granting.`);
  await sql.query(`alter role ${ROLE} with login password '${password}' nobypassrls`);
} else {
  await sql.query(`create role ${ROLE} with login password '${password}' nobypassrls`);
  console.log(`Created role ${ROLE}.`);
}

// Least-privilege grants: full DML on app tables, nothing structural.
for (const stmt of [
  `grant usage on schema public to ${ROLE}`,
  `grant select, insert, update, delete on all tables in schema public to ${ROLE}`,
  `grant usage, select on all sequences in schema public to ${ROLE}`,
  // Tables created by future migrations (run as owner) stay accessible.
  `alter default privileges in schema public grant select, insert, update, delete on tables to ${ROLE}`,
  `alter default privileges in schema public grant usage, select on sequences to ${ROLE}`,
]) {
  await sql.query(stmt);
}
console.log("Granted DML on schema public (+ default privileges for future tables).");

const url = new URL(DATABASE_URL);
url.username = ROLE;
url.password = password;
console.log(`\nApp connection string (save it — the password is not stored anywhere):\n\n${url.toString()}\n`);
console.log("Use this URL for verify-rls now, and as the app's DATABASE_URL in production.");
