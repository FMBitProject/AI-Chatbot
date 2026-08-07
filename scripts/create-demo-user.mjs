import { hashPassword } from "@better-auth/utils/password";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

// Use DATABASE_URL from the environment (e.g. CI) if set, otherwise fall back
// to reading the local .env.local file for manual/local runs.
let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  const envFile = readFileSync("/home/user/ai-chatbot/.env.local", "utf8");
  const envVars = {};
  for (const line of envFile.split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    envVars[key] = val;
  }
  databaseUrl = envVars.DATABASE_URL;
}

const sql = neon(databaseUrl);

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@intellibase.app";
const DEMO_NAME = "Demo Midtrans";
const COMPANY_NAME = "Demo IntelliBase";

// Supplied at run time, never written down here.
//
// This script existed for the Midtrans account review, which is closed — the
// demo admin has been locked out since go-live. What stayed behind was a
// committed password for a real, verified admin account: anyone who read the
// repo knew the credentials, and running this against a production
// DATABASE_URL would quietly recreate that account and let them back in. The
// account is only as locked out as this file lets it be.
//
// So the caller has to say it out loud:
//   DEMO_PASSWORD='...' DATABASE_URL='...' node scripts/create-demo-user.mjs
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) {
  console.error(
    "DEMO_PASSWORD is not set. This script creates a verified admin account, so it\n" +
    "refuses to run with a password that lives in the repository.\n\n" +
    "  DEMO_PASSWORD='<pick one>' node scripts/create-demo-user.mjs\n"
  );
  process.exit(1);
}

async function main() {
  // Check if already exists
  const existing = await sql`SELECT id FROM users WHERE email = ${DEMO_EMAIL}`;
  if (existing.length > 0) {
    console.log("Akun sudah ada, update email_verified saja...");
    await sql`UPDATE users SET email_verified = true WHERE email = ${DEMO_EMAIL}`;
    console.log("email_verified diset ke true.");
    return;
  }

  // Hash password
  const hashed = await hashPassword(DEMO_PASSWORD);

  const companyId = randomUUID();
  const userId = randomUUID();

  // Insert company
  await sql`INSERT INTO companies (id, name) VALUES (${companyId}, ${COMPANY_NAME})`;
  console.log("Company created:", companyId);

  // Insert user (two_factor_enabled explicitly false so automated/demo login
  // is never blocked by an email OTP challenge)
  await sql`
    INSERT INTO users (id, name, email, email_verified, role, company_id, two_factor_enabled, created_at, updated_at)
    VALUES (${userId}, ${DEMO_NAME}, ${DEMO_EMAIL}, true, 'admin', ${companyId}, false, NOW(), NOW())
  `;
  console.log("User created:", userId);

  // Insert account (credentials)
  await sql`
    INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
    VALUES (${randomUUID()}, ${DEMO_EMAIL}, 'credential', ${userId}, ${hashed}, NOW(), NOW())
  `;
  console.log("Account (credential) created.");

  console.log("\n✓ Akun demo berhasil dibuat:");
  console.log("  Email   :", DEMO_EMAIL);
  // Not echoed: the caller already has it, and this output goes to a terminal
  // scrollback or a CI log that outlives the run.
  console.log("  Password: (the DEMO_PASSWORD you supplied)");
}

main().catch(console.error);
