import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { withTransaction } from "@/lib/db/transaction";
import { companies, transactions } from "@/lib/db/schema";
import { planRank, planRankInForce } from "@/lib/pricing";

// Compare timestamps using the database clock that wrote created_at.
export const checkoutOrderFields = {
  ...getTableColumns(transactions),
  withinReuseWindow: sql<boolean>`${transactions.createdAt} > now() - interval '24 hours'`,
  // Legacy tokens may use merchant-configured expiry. Seven days is Snap's
  // maximum token lifetime; a Core API 404 alone does not revoke a Snap page.
  tokenMayBeActive: sql<boolean>`${transactions.createdAt} > now() - interval '7 days'`,
};

// Drizzle wraps driver errors in cause; tolerate either shape and cycles.
export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (typeof error === "object" && error !== null && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && error.code === "23505") return true;
    error = "cause" in error ? error.cause : undefined;
  }
  return false;
}

// Serialize the final decision across ALL plans for this company. No provider
// calls under the row lock: a losing Snap token is never exposed to a customer.
// Keep the existing unique index as a second guard for older writers.
export async function recordCheckout(order: typeof transactions.$inferInsert) {
  return withTransaction(async (tx) => {
    const [company] = await tx.select().from(companies)
      .where(eq(companies.id, order.companyId)).for("update");
    if (!company) throw new Error("Company not found");
    if (planRank(order.plan) < planRankInForce({
      plan: company.plan, expiresAt: company.planExpiresAt, isPilot: company.isPilot,
    })) return { result: "downgrade" as const };

    const [pending] = await tx.select(checkoutOrderFields).from(transactions).where(and(
      eq(transactions.companyId, order.companyId), eq(transactions.status, "pending"),
    )).limit(1);
    if (pending) return { result: "pending" as const, order: pending };

    await tx.insert(transactions).values(order);
    return { result: "created" as const };
  });
}
