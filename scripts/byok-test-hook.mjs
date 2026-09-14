import "./security-test-hook.mjs";
import { registerHooks } from "node:module";

const database = new URL("./security-test-db.mjs", import.meta.url).href;
const auth = new URL("./byok-test-auth.mjs", import.meta.url).href;
registerHooks({
  resolve(spec, context, next) {
    if (spec === "@/lib/auth-guard" || spec === "@/lib/rate-limit") return { url: auth, shortCircuit: true };
    if (context.parentURL?.endsWith("/ai-settings-store.ts") && spec === "./db/tenant") {
      return { url: database, shortCircuit: true };
    }
    return next(spec, context);
  },
});
