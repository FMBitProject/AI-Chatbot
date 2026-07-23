import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "./schema";

// The neon-serverless Pool talks to Postgres over a WebSocket (unlike the
// stateless neon-http driver in ./index.ts, which cannot hold a transaction).
// In a Node runtime there is no browser WebSocket, so the driver needs one
// supplied. Node 22 has a global WebSocket, but neon validates against `ws`, so
// we wire it explicitly to avoid relying on undici's implementation.
neonConfig.webSocketConstructor = ws;

type TenantDb = NeonDatabase<typeof schema>;

// The transaction handle drizzle hands to a `.transaction()` callback. Callers
// (retrieveChunks and the route handlers) run their queries against this handle
// so those queries execute inside the RLS-scoped transaction.
export type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

// Runs `fn` inside a transaction whose Postgres session has `app.company_id` set
// to `companyId`. The RLS policies on the tenant tables (see
// drizzle/0004_row_level_security.sql) read that GUC, so every query on those
// tables inside the callback is constrained to this company at the database
// level — even a query that forgets its own `where company_id = ...` returns
// nothing rather than leaking another tenant's rows.
//
// set_config(..., true) makes the value transaction-local, so it is discarded on
// COMMIT/ROLLBACK and can never bleed into another request that reuses the
// pooled connection.
//
// A fresh Pool per call is the documented serverless pattern: the WebSocket
// handshake adds a little latency, which is a non-issue at this app's volume and
// worth the guarantee that connections are never left dangling between requests.
export async function withTenant<T>(
  companyId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!companyId) {
    // Defensive: an empty GUC would make every RLS check compare against NULL
    // and silently match nothing. Fail loudly instead of returning empty data.
    throw new Error("withTenant called without a companyId");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tdb = drizzle(pool, { schema });
    return await tdb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
      return fn(tx);
    });
  } finally {
    await pool.end();
  }
}
