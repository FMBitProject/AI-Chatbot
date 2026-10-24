# Self-hosting (Docker on a VPS)

The app is moving off Vercel's Hobby plan, which does not permit commercial
use. Vercel keeps serving production until DNS is switched; this document
covers what runs where once it is.

## How an update reaches the server

```
PR merged to main
  → .github/workflows/docker-image.yml builds the Dockerfile on GitHub's runners
  → pushes ghcr.io/fmbitproject/ai-chatbot:sha-<commit> and :latest
  → the VPS pulls the image and restarts the container
```

The last step is automatic: on the VPS, `~/intellibase/auto-update.sh` runs
from cron every 5 minutes, pulls `:latest`, and redeploys only when the image
differs from the running one. Expect a merge to be live on the VPS about
5 minutes after the workflow finishes. To hold a build (after a rollback with
`IMAGE_TAG=sha-xxxxxxx ./deploy.sh`), create `~/intellibase/TAHAN`; delete it to
resume. Updates are logged to `~/intellibase/auto-update.log`.

The image is never built on the VPS: `next build` peaks at 2-3 GB of RAM.
The running server (`.next/standalone/server.js`) needs roughly 200-500 MB.

## Configuration

**Build time — repo variables** (Settings > Secrets and variables > Actions >
Variables). Every `NEXT_PUBLIC_*` value is inlined into the client bundle by
`next build`; setting it on the running container has no effect. Changing one
means rebuilding the image. The workflow lists which are required.

**Run time — the container's environment** (an env file on the VPS, outside
any checkout, mode 600). Everything server-side: `DATABASE_URL`,
`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_ENV`,
`CRON_SECRET`, `BYOK_SECRET_KEY`, the AI provider keys, Resend, Slack, and the
rest of `.env.local.example` and `.env.example`. `MIDTRANS_ENV` must match the `NEXT_PUBLIC_MIDTRANS_ENV`
the image was built with.

## What behaves differently from Vercel

- **Cron.** `vercel.json` crons run only on Vercel. On the VPS,
  `/api/cron/reconcile-payments` (02:00 UTC) and `/api/cron/index-documents`
  (03:00 UTC) must be called by the host's scheduler with
  `Authorization: Bearer $CRON_SECRET`. Exactly one of the two platforms may
  run them at a time: switch the scheduler over in the same change that moves
  DNS, and remove `crons` from `vercel.json` once Vercel no longer serves
  production.
- **`maxDuration` is ignored.** A long-lived Node server has no per-request
  ceiling. The route-level values stay for as long as Vercel is in use.
- **`after()`** is supported by `next start` / `server.js`. Pending callbacks
  run during graceful shutdown, so the container needs a stop grace period
  longer than Docker's 10 s default.
- **Client IP for rate limiting** (`src/lib/rate-limit.ts`) falls back to the
  *last* `X-Forwarded-For` entry when `x-vercel-forwarded-for` is absent.
  Caddy replaces `X-Forwarded-For` from untrusted clients with the real peer
  address, so that entry is the visitor. **If a CDN such as Cloudflare is put
  in front, the last entry becomes the CDN's edge address and every visitor
  shares one rate-limit bucket** — configure Caddy's `trusted_proxies` for the
  CDN's ranges before enabling it.
- **Auth origins.** `VERCEL_URL` / `VERCEL_BRANCH_URL` are unset, so
  `trustedOrigins` is just `BETTER_AUTH_URL`. A staging host needs its own
  `BETTER_AUTH_URL`.
- **Vercel Web Analytics** is rendered only when `VERCEL` is set; GA4 and the
  Meta Pixel are unaffected.
- **No preview deployments.** PRs still get a build check from the workflow.
- **Gemini refuses the VPS's address** with "User location is not supported
  for the API use." — indexing, document search, the Gemini fallback model
  and the demo chat all depend on it. Calls go through a Cloudflare Worker
  relay instead (`google-relay` on the owner's Cloudflare account): set
  `GOOGLE_AI_BASE_URL=https://<worker>.workers.dev/v1beta` and
  `GOOGLE_AI_RELAY_KEY` (must equal the Worker's `RELAY_KEY` secret). The
  Worker forwards requests to generativelanguage.googleapis.com unchanged and
  refuses any without the key. Every Gemini key, BYOK customers' included,
  passes through it, so it must not log request headers. Leave both unset on
  Vercel.
