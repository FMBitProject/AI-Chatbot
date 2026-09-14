import "./security-test-hook.mjs";
import { registerHooks } from "node:module";
const fixture = new URL("./api-design-test-fixture.mjs", import.meta.url).href;
const mocked = new Set(["auth-guard", "subscription", "indexing", "byok", "embeddings", "retrieval", "models", "alerts"]);
registerHooks({
  resolve(spec, context, next) {
    if (mocked.has(spec.replace("@/lib/", "")) && spec.startsWith("@/lib/")) {
      return { url: fixture, shortCircuit: true };
    }
    if (spec === "./alerts" && context.parentURL?.endsWith("/api-error.ts")) return { url: fixture, shortCircuit: true };
    return next(spec, context);
  },
});
