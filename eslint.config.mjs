import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Authentication belongs to @/lib/auth-guard, and only to it.
  //
  // The guard exists so no route can be shipped with the check half-copied, but
  // a shared helper nobody is obliged to call is just a convention — which is
  // exactly what it replaced. This makes it a build error instead: a route
  // handler that authenticates by hand fails lint.
  //
  // Scoped to route handlers and to `auth.api.getSession` specifically, so the
  // rest of better-auth's API stays available where it is genuinely needed —
  // signUpEmail, changePassword and auth.$context are all still called directly
  // by the routes that own those flows.
  {
    files: ["src/app/api/**/route.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name='getSession'][object.property.name='api'][object.object.name='auth']",
          message:
            "Jangan panggil auth.api.getSession langsung di route handler. Pakai requireSession/requireUser/requireAdmin dari @/lib/auth-guard.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
