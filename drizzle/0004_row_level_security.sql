-- Row-Level Security for tenant isolation on the knowledge-base content tables.
--
-- These two tables hold the actual internal documents (and their embedded
-- chunks) uploaded by each company. A cross-tenant leak here means one client
-- could read another client's SOPs/protocols — the single worst failure for a
-- multi-tenant knowledge base, so we defend it at the database layer, not just
-- in application code.
--
-- How it works: the app opens a transaction and runs
--   select set_config('app.company_id', <companyId>, true);
-- (see src/lib/db/tenant.ts -> withTenant). The policies below constrain every
-- row to that GUC. Because the app's Neon role OWNS these tables — and owners
-- bypass ordinary RLS — we also FORCE RLS so the policy applies to the app too.
-- A forgotten `WHERE company_id = ...` therefore returns 0 rows instead of
-- leaking, and an INSERT without the context set is rejected by WITH CHECK.
--
-- current_setting('app.company_id', true): the second arg (missing_ok) makes an
-- unset GUC evaluate to NULL rather than raising, so `company_id = NULL` simply
-- matches nothing — fail closed, never fail open.

--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "documents_tenant_isolation" ON "documents";
--> statement-breakpoint
CREATE POLICY "documents_tenant_isolation" ON "documents"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
--> statement-breakpoint
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_chunks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "document_chunks_tenant_isolation" ON "document_chunks";
--> statement-breakpoint
CREATE POLICY "document_chunks_tenant_isolation" ON "document_chunks"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
