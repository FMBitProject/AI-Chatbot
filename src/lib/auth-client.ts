import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // The page's own origin comes first, and the environment variable is only the
  // fallback for the render that has no window.
  //
  // The order used to be reversed, which quietly meant "post every auth request
  // to whatever host NEXT_PUBLIC_APP_URL was baked with, no matter which host
  // the user is actually on". In production those are the same host and nothing
  // showed. Anywhere else they are not: a Vercel preview sent its sign-in to the
  // production domain (cross-origin, so the browser blocks it) and a dev server
  // on a port other than the configured one sent it into the void. Both surface
  // as the login page's generic "Terjadi kesalahan", because a blocked request
  // and an unreachable one look identical from here.
  //
  // Same-origin is also simply what is true: the auth API is a route inside this
  // very app, so whichever host served the page is the host that serves
  // /api/auth. Deriving it removes a whole class of environment mismatch instead
  // of asking every environment to configure its way out of one.
  baseURL: typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/two-factor";
      },
    }),
  ],
});
