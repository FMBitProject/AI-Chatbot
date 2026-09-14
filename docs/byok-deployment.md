# Deploying multi-provider BYOK

Apply migration `0021_bumpy_warpath.sql` **before** deploying the multi-provider
code. It only adds two tables, their foreign keys, and forced tenant RLS; it is
safe while the previous application version is serving requests.

`npm run db:migrate` targets the database in `.env.local`. Check which migrations
are pending before running it: in this repository this is the production DB.
Deploy the code only after the migration completes. Builds do not apply or
validate the database migration.

The code reads `company_ai_settings` and `company_ai_providers` for admin settings,
chat, public queries, search, Slack, and indexing. If either table is missing,
admin endpoints return errors and AI requests cannot resolve credentials.

Existing Groq/Gemini keys stay in the old columns until the workspace saves the
new configuration. The first save moves them in one transaction and clears the
old columns. After that, rolling back to code that only reads the old columns
would stop honoring BYOK; retain the new resolver or explicitly migrate the
credentials back before such a rollback.

`BYOK_SECRET_KEY` must remain unchanged. New BYOK configurations require a
company Gemini key for `gemini-embedding-001`; selecting Anthropic/OpenAI for
answers never changes the embedding model. Existing Groq-only configurations
retain their legacy embedding behavior until explicitly migrated.

Run `npm run test:byok` for temporary PostgreSQL tests of routing, encryption,
legacy migration, rollback on invalid saves, and tenant RLS. These tests do not
use the production database or call real AI providers.

The admin response includes a configuration revision. PUT and DELETE send that
revision in `If-Match`; a stale form is rejected instead of overwriting another
admin's changes. After updating the UI/API together, reload any old browser tabs
before saving settings.
