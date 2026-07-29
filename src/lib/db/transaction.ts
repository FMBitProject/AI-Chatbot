import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// The neon-http driver behind `db` (see ./index.ts) is stateless and cannot hold
// a transaction: every statement commits on its own. Anything that must be
// all-or-nothing — e.g. marking a payment settled and granting the plan it paid
// for — goes through this Pool-backed handle instead, which talks to Postgres
// over a WebSocket and can BEGIN/COMMIT. Same reasoning and same `ws` wiring as
// withTenant() in ./tenant.ts; that one additionally scopes the transaction to a
// tenant via RLS, which the tables here (companies, transactions) do not use.
neonConfig.webSocketConstructor = ws;

type TransactionDb = NeonDatabase<typeof schema>;

// The handle drizzle passes to a `.transaction()` callback. Not exported:
// callers get it by inference from withTransaction's signature.
type Tx = Parameters<Parameters<TransactionDb["transaction"]>[0]>[0];

/**
 * Runs `fn` inside a single Postgres transaction. Every query must go through
 * the `tx` handle to take part in it. Throwing from `fn` rolls the whole thing
 * back — which is the point: a caller that fails halfway leaves no partially
 * applied state behind, so retrying it is safe.
 *
 * Keep the callback short and purely database-bound. Rows it writes stay locked
 * until it returns, so anything slow in there blocks every concurrent request
 * touching the same rows. In particular: **never await a network call inside**
 * (a payment provider, an LLM, an email send). Do that work first, then open the
 * transaction with the result in hand.
 *
 * A fresh Pool per call is the documented serverless pattern, same as
 * withTenant(): the WebSocket handshake costs ~100ms, which is worth paying for
 * the guarantee that no connection is left dangling between requests. Don't use
 * this for ordinary single-statement reads and writes — `db` is cheaper and
 * already atomic for those.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  // Fail with the same clear message as getDb() rather than letting the Pool
  // report an opaque connection error several frames away from the cause.
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  const pool = new Pool({ connectionString });
  try {
    const tdb = drizzle(pool, { schema });
    return await tdb.transaction(fn);
  } finally {
    await pool.end();
  }
}
