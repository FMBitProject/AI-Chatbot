import { createHash } from "crypto";
import { sql } from "drizzle-orm";

export type RateRule = { max: number; windowMs: number };

// Reuse the existing expiring-record table with a namespace that cannot match
// auth verification identifiers. The PK serializes concurrent increments
// across instances. No migration, raw IP storage, or process-local fallback.
export function rateLimitQuery(key: string, rule: RateRule, increment: boolean) {
  const id = `rate-limit:${createHash("sha256").update(`${key}:${rule.max}:${rule.windowMs}`).digest("hex")}`;
  if (!increment) {
    return sql`select value::bigint as count,
      ceil(extract(epoch from (expires_at - now()))) as retry_after
      from verifications where id = ${id} and expires_at > now()`;
  }
  return sql`
    with pruned as (
      delete from verifications where id in (
        select id from verifications
        where identifier like 'rate-limit:%' and expires_at <= now() and id <> ${id}
        limit 100
      )
    )
    insert into verifications (id, identifier, value, expires_at, created_at, updated_at)
    values (${id}, ${id}, '1', now() + ${rule.windowMs} * interval '1 millisecond', now(), now())
    on conflict (id) do update set
      value = case when verifications.expires_at <= now() then '1'
        else least(verifications.value::bigint + 1, ${rule.max + 1})::text end,
      expires_at = case when verifications.expires_at <= now()
        then excluded.expires_at else verifications.expires_at end,
      updated_at = now()
    returning value::bigint as count,
      ceil(extract(epoch from (expires_at - now()))) as retry_after
  `;
}

export async function sharedBucket(key: string, rule: RateRule, increment: boolean) {
  const { db } = await import("@/lib/db");
  const result = await db.execute(rateLimitQuery(key, rule, increment));
  const row = result.rows[0];
  return { count: Number(row?.count ?? 0), retryAfter: Math.max(0, Number(row?.retry_after ?? 0)) };
}
