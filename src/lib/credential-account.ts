import { randomUUID } from "crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import { accounts, companies, users } from "@/lib/db/schema";
import { isPasswordValid } from "@/lib/password";
import { LIMITS } from "@/lib/validate";
import { withTenant } from "@/lib/db/tenant";
import { count, eq } from "drizzle-orm";
import { isUnderLimit, getLimits } from "@/lib/plan-limits";
import { getEffectiveSubscription } from "@/lib/pricing";

export class SeatLimitError extends Error {}

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
    await withTenant(input.companyId, async (tx) => {
      // All seat-creating requests lock the same workspace before counting.
      const [workspace] = await tx.select({ id: companies.id, plan: companies.plan, planExpiresAt: companies.planExpiresAt }).from(companies)
        .where(eq(companies.id, input.companyId)).for("update");
      if (!workspace) throw new Error("Workspace not found");
      const effective = getEffectiveSubscription(workspace.plan, workspace.planExpiresAt, new Date());
      const { maxEmployees } = getLimits(effective.plan);
      const [seats] = await tx.select({ count: count() }).from(users)
        .where(eq(users.companyId, input.companyId));
      if (!isUnderLimit(seats.count, maxEmployees)) throw new SeatLimitError("Seat limit reached");
      await tx.insert(users).values(user);
      await tx.insert(accounts).values(credential);
    });
  }
  return user;
}

export function isUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && error.cause !== error && isUniqueConflict(error.cause);
}
