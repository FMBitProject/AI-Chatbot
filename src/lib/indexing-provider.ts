import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { indexingProviderSlots } from "@/lib/db/schema";

export class ProviderBusyError extends Error {}

// This governs ingestion across browser, cron and worker processes. Query
// embeddings remain interactive and do not wait behind ingestion.
export async function withEmbeddingSlot<T>(apiKey: string | null, run: () => Promise<T>): Promise<T> {
  const keyHash = createHash("sha256")
    .update(apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "platform-unconfigured")
    .digest("hex");
  const token = randomUUID();
  // Batch embedding has a hard 120s maximum; leave room for response handling.
  const acquired = await db.execute(sql`
    insert into ${indexingProviderSlots} (key_hash, token, lease_until, next_allowed_at)
    values (${keyHash}, ${token}, now() + interval '150 seconds', now())
    on conflict (key_hash) do update
      set token = excluded.token, lease_until = excluded.lease_until
      where ${indexingProviderSlots.leaseUntil} <= now()
        and ${indexingProviderSlots.nextAllowedAt} <= now()
    returning key_hash
  `);
  if (acquired.rows.length === 0) throw new ProviderBusyError("Embedding key is busy or cooling down");
  let cooldownMs = 1000;
  try {
    return await run();
  } catch (error) {
    // A short, shared cooldown also prevents retry storms after timeouts or
    // transport failures. The next process sees the same cooldown in Postgres.
    cooldownMs = 35_000;
    throw error;
  } finally {
    await db.update(indexingProviderSlots).set({
      leaseUntil: sql`now()`,
      nextAllowedAt: sql`now() + ${cooldownMs} * interval '1 millisecond'`,
    }).where(and(eq(indexingProviderSlots.keyHash, keyHash), eq(indexingProviderSlots.token, token)));
  }
}
