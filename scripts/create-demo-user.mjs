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

const DEMO_EMAIL = "demo@intellibase.app";
const DEMO_PASSWORD = "Demo@12345";
const DEMO_NAME = "Demo Midtrans";
const COMPANY_NAME = "Demo IntelliBase";

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
  console.log("  Password:", DEMO_PASSWORD);
}

main().catch(console.error);
