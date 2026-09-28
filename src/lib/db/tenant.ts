import { Client, Pool, neonConfig } from "@neondatabase/serverless";
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

export interface TenantOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

// A dedicated client lets cancellation close the actual connection, releasing
// locks and rolling back pending writes. Racing a timer alone would leave the
// transaction running after the caller has already received a timeout.
async function withBoundedTenant<T>(
  companyId: string,
  fn: (tx: TenantTx, signal?: AbortSignal) => Promise<T>,
  options: TenantOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Tenant timeout must be a positive finite number");
  }
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const signal = controller.signal;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: Math.min(timeoutMs, 5_000),
    query_timeout: Math.min(timeoutMs, 5_000),
  });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= client.end().catch(() => undefined);
  const forwardAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Database transaction timed out", "TimeoutError"));
  }, timeoutMs);
  const onClientError = (error: Error) => controller.abort(error);
  client.on("error", onClientError);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void close();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const work = async () => {
    signal.throwIfAborted();
    await client.connect();
    signal.throwIfAborted();
    return drizzle(client, { schema }).transaction(async tx => {
      await tx.execute(sql`select
        set_config('app.company_id', ${companyId}, true),
        set_config('statement_timeout', ${String(Math.min(timeoutMs, 5_000))}, true),
        set_config('lock_timeout', ${String(Math.min(timeoutMs, 5_000))}, true)`);
      signal.throwIfAborted();
      const result = await fn(tx, signal);
      signal.throwIfAborted();
      return result;
    });
  };
  try {
    return await Promise.race([work(), aborted]);
  } finally {
    try {
      // An aborted connection is already being closed. Do not let a stalled
      // WebSocket shutdown turn cancellation into another unbounded wait.
      if (signal.aborted) void close();
      else await Promise.race([close(), aborted]);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", forwardAbort);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

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
  fn: (tx: TenantTx, signal?: AbortSignal) => Promise<T>,
  options?: TenantOptions,
): Promise<T> {
  if (!companyId) {
    // Defensive: an empty GUC would make every RLS check compare against NULL
    // and silently match nothing. Fail loudly instead of returning empty data.
    throw new Error("withTenant called without a companyId");
  }

  if (options) return withBoundedTenant(companyId, fn, options);

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
