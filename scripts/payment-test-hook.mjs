import "./ts-resolve-hook.mjs";
import { registerHooks } from "node:module";
const fixture = new URL("./payment-test-fixture.mjs", import.meta.url).href;
registerHooks({ resolve(spec, context, next) {
  if (["@/lib/db", "@/lib/db/transaction", "@/lib/auth-guard", "@/lib/rate-limit", "@/lib/alerts"].includes(spec)) {
    return { url: fixture, shortCircuit: true };
  }
  return next(spec, context);
} });
process.env.MIDTRANS_SERVER_KEY = "test-only";
process.env.CRON_SECRET = "test-only";
globalThis.fetch = async () => { throw new Error("Network disabled in payment tests"); };
