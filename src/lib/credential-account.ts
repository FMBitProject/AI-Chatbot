import { randomUUID } from "crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import { accounts, companies, users } from "@/lib/db/schema";
import { isPasswordValid } from "@/lib/password";
import { LIMITS } from "@/lib/validate";

// Only server provisioning calls this. Never adopt or delete a user by email.
// neon-http batch executes all statements in one transaction, including the
// unique-email check performed by Postgres on INSERT.
export async function createCredentialAccount(input: {
  name: string;
  email: string;
  password: string;
  companyId: string;
  role: "admin" | "employee";
  department?: string | null;
  emailVerified?: boolean;
  workspace?: { name: string; accountType: "company" | "individual" };
}) {
  if (input.password.length > LIMITS.password || !isPasswordValid(input.password)) {
    throw new Error("Invalid password");
  }
  const id = randomUUID();
  const now = new Date();
  const user = {
    id, name: input.name, email: input.email.trim().toLowerCase(),
    companyId: input.companyId, role: input.role,
    department: input.department ?? null, emailVerified: input.emailVerified ?? false,
    createdAt: now, updatedAt: now,
  };
  const credential = {
    id: randomUUID(), userId: id, accountId: id, providerId: "credential",
    password: await hashPassword(input.password), createdAt: now, updatedAt: now,
  };
  if (input.workspace) {
    await db.batch([
      db.insert(companies).values({ id: input.companyId, ...input.workspace }),
      db.insert(users).values(user),
      db.insert(accounts).values(credential),
    ]);
  } else {
    await db.batch([db.insert(users).values(user), db.insert(accounts).values(credential)]);
  }
  return user;
}

export function isUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && error.cause !== error && isUniqueConflict(error.cause);
}
