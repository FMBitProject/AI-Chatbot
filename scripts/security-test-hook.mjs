import "./ts-resolve-hook.mjs";
import { registerHooks } from "node:module";

const fixture = new URL("./security-test-db.mjs", import.meta.url).href;
registerHooks({
  resolve(spec, context, next) {
    if (spec === "@/lib/db" || spec === "@/lib/mail") {
      return { url: fixture, shortCircuit: true };
    }
    return next(spec, context);
  },
});

process.env.BETTER_AUTH_SECRET = "security-test-only-secret-01234567890123456789";
process.env.BETTER_AUTH_URL = "https://security-test.invalid";
// Abort any accidental provider/production request in this test process.
globalThis.fetch = async () => { throw new Error("Network is disabled in security tests"); };
