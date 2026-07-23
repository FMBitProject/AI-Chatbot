-- Phase 2 of tenant-isolation RLS: the Q&A history tables.
--
-- chat_sessions and chat_messages hold employees' questions and the AI's
-- answers (which quote internal documents). A cross-tenant leak here would
-- expose one company's internal Q&A to another, so we extend the same
-- app.company_id GUC-based RLS used for documents in 0004.
--
-- chat_messages has NO company_id column of its own — it is scoped through its
-- session. So its policy checks that the row's session_id belongs to a
-- chat_sessions row visible for the current company. That subquery itself runs
-- under chat_sessions' RLS, so it can only ever see the current tenant's
-- sessions — belt and suspenders.
--
-- As in 0004: FORCE so the app's table-owner role is not exempt, and
-- current_setting(..., true) so a missing context matches nothing (fail closed).
-- transactions is deliberately NOT covered: the Midtrans webhook looks a
-- transaction up by order_id with no company context (to discover the company),
-- so RLS there would break payment confirmation. It stays application-scoped,
-- like api_keys.

--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "chat_sessions_tenant_isolation" ON "chat_sessions";
--> statement-breakpoint
CREATE POLICY "chat_sessions_tenant_isolation" ON "chat_sessions"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "chat_messages_tenant_isolation" ON "chat_messages";
--> statement-breakpoint
CREATE POLICY "chat_messages_tenant_isolation" ON "chat_messages"
  USING ("session_id" IN (SELECT "id" FROM "chat_sessions" WHERE "company_id" = current_setting('app.company_id', true)))
  WITH CHECK ("session_id" IN (SELECT "id" FROM "chat_sessions" WHERE "company_id" = current_setting('app.company_id', true)));
