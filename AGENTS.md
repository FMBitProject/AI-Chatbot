# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

The one that bites most often: there is no `middleware.ts`. Route interception
lives in [src/proxy.ts](src/proxy.ts) instead (the App Router's `proxy`
convention replaced `middleware` in this version). If you go looking for
`middleware.ts`, you are looking for the wrong file.

## What this app is

IntelliBase AI — a multi-tenant internal-knowledge-base SaaS. Employees ask
questions in chat; answers are grounded in the company's own documents via RAG
(pgvector similarity search) rather than the model's general knowledge.
Product/company docs: [prd.md](prd.md), [docs/](docs/).

## Commands

```
npm run dev             # start the app (do not also run this if a dev server is already up)
npm run build            # production build
npm run lint              # eslint

npm run db:generate       # drizzle-kit: generate a migration from schema.ts changes
npm run db:migrate        # drizzle-kit: apply pending migrations — WRITES TO THE PROD DB, see below
npm run db:push           # drizzle-kit: push schema directly (no migration file) — dev/scratch only
npm run db:studio         # drizzle-kit studio

npm run content:generate   # generate this week's marketing content pack (Gemini, free tier)
npm run content:lint       # run the claim-checker over generated copy
npm run content:lint:test  # regression check for the lint rules themselves
npm run content:cards      # render social image cards
npm run content:channels   # push drafts to Buffer (LinkedIn only; Buffer can't upload media for YT/IG)

npm run inbox:check        # poll hello@ inbox via IMAP
npm run inbox:triage       # classify only, no draft
npm run inbox:dry          # draft without saving
npm run inbox:draft        # draft replies as Gmail drafts (never sends — no SMTP configured)
npm run inbox:test         # regression check for the triage rules
```

There is no test framework (no Jest/Vitest) — `*.test.mjs` files under
`scripts/` are plain Node scripts with hand-rolled assertions, run directly
with `node`, not through a runner. To run one test file in isolation:
`node scripts/inbox/triage.test.mjs`.

`db:migrate` and `db:push` run against `DATABASE_URL` in `.env.local`, which
points at the real production Neon database — there is no separate
dev/staging DB. Merging a schema migration that a not-yet-deployed code path
depends on (or vice versa) produces live 500s between the two deploys; land
schema and code so the migration is safe to run standalone.

## Architecture

**Two DB access paths, not interchangeable.** [src/lib/db/index.ts](src/lib/db/index.ts)
is a stateless `neon-http` connection for ordinary queries.
[src/lib/db/tenant.ts](src/lib/db/tenant.ts) opens a `neon-serverless`
WebSocket connection and runs a callback inside a transaction with
`app.company_id` set via `set_config(..., true)` — that GUC is what Postgres
row-level security policies (`drizzle/0004_row_level_security.sql`,
`0005_row_level_security_chat.sql`) key off of. Any query that touches a
tenant-scoped table (documents, document_chunks, chat_sessions,
chat_messages, ...) needs to go through `withTenant()`, or RLS will silently
return zero rows rather than another tenant's data — fail-closed, but easy to
mistake for a bug in the calling code if you don't know RLS is there.

**Auth has exactly one entry point.** [src/lib/auth-guard.ts](src/lib/auth-guard.ts)
exports `requireSession` / `requireUser` / `requireAdmin` /
`requireCompanyAdmin`, in ascending strictness. No other file may call
`auth.api.getSession` directly — `eslint.config.mjs` has a
`no-restricted-syntax` rule that fails the build if you do. Each guard
returns a discriminated union (`{ ok: false, response }` or `{ ok: true,
user }`) instead of throwing, so `if (!guard.ok) return guard.response;` is
required to reach `guard.user` at all — the type system, not a comment,
enforces the check.

`src/proxy.ts` is **not** where auth lives. It only handles maintenance mode
(`MAINTENANCE_MODE` env var, with a `?mnt-bypass=` cookie escape hatch,
carefully excluding the Midtrans webhook — see the comment block at the top
of the file) and per-IP rate limiting, plus a redirect-if-no-cookie check for
`/chat` and `/admin` page routes. It never runs on `/api/*` and never
validates the session token or role. `auth-guard.ts` + Postgres RLS are the
two real layers of defense.

**RAG pipeline**: upload → [document-extraction.ts](src/lib/document-extraction.ts)
(pdf/docx/xlsx text extraction) → [chunker.ts](src/lib/chunker.ts) (boundary
chunking) → [embeddings.ts](src/lib/embeddings.ts) (`gemini-embedding-001`,
fixed — see below) → [document-ingest.ts](src/lib/document-ingest.ts) /
[indexing.ts](src/lib/indexing.ts) → stored in `document_chunks.embedding`
(pgvector) → [retrieval.ts](src/lib/retrieval.ts) does the similarity search
inside a `withTenant()` transaction → [rag-prompt.ts](src/lib/rag-prompt.ts)
assembles the grounded prompt for chat, the public API (`/api/v1/query`),
and both Slack entry points.

**Model selection is centralized** in [src/lib/models.ts](src/lib/models.ts):
an ordered fallback chain (Groq → Google, strongest first) shared by chat,
the public API, and both Slack routes, so a single provider's 429 doesn't
take down four surfaces independently the way it used to when the model id
was a string literal duplicated in five files. Embeddings are deliberately
**not** part of this chain and must stay pinned to one model — vectors from
two embedding models are silently incomparable (cosine distance still
returns a number, nothing throws, retrieval just returns wrong chunks), so
switching embedding models means re-indexing every document, not a config
edit.

**Multi-tenancy / account types**: a tenant is a `companies` row; `users.role`
is `admin` | `employee`. Company accounts and solo "Individual" accounts
share the same tables (`companies` doubles as the individual's personal
workspace) — see [src/lib/industries.ts](src/lib/industries.ts),
[pricing.ts](src/lib/pricing.ts), [plan-limits.ts](src/lib/plan-limits.ts),
[subscription.ts](src/lib/subscription.ts) for the tier/quota logic layered
on top.

**Payments** go through Midtrans (`src/lib/midtrans.ts`, `payment.ts`,
`src/app/api/payment/*`), reconciled by a cron job
(`src/app/api/cron/reconcile-payments`) that catches webhook deliveries
missed during maintenance windows or transient failures — webhooks are not
assumed to be reliable.

**CSP is centralized and per-integration** in [next.config.ts](next.config.ts):
every external host is grouped by the feature that needs it (Midtrans Snap,
GA4, the YouTube demo embed, Google Drive Picker/Identity for admin-only
import) with a comment explaining why that host is there. Add new external
script/frame/fetch targets there, scoped and commented the same way, even if
the feature is admin-only — CSP is site-wide.

**BYOK**: customers can supply their own provider API keys
([src/lib/byok.ts](src/lib/byok.ts)), stored AES-256-GCM encrypted under
`BYOK_SECRET_KEY` ([src/lib/secret-box.ts](src/lib/secret-box.ts)).

**Marketing automation** (`scripts/content/`) and **inbox draft bot**
(`scripts/inbox/`) are standalone Node scripts, not part of the Next.js app —
they run out-of-band (cron/manual) and are documented in their own
`scripts/content/README.md` and `scripts/inbox/README.md`. The inbox bot
only ever creates drafts; there is no SMTP configured, so it cannot send
mail even if asked to.
