-- Monthly question usage moves from "count rows in chat_messages" to a counter
-- column on companies. Only the chat UI writes chat history, so the old count
-- silently ignored every question asked through the public API (/api/v1/query)
-- and Slack — those channels could run past the monthly quota indefinitely.

ALTER TABLE "companies" ADD COLUMN "monthly_question_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "monthly_question_month" text;--> statement-breakpoint
-- Backfill the current month from the chat history, so switching over does not
-- hand every company a fresh monthly quota mid-month.
--
-- chat_sessions and chat_messages are under FORCE row level security (see 0005),
-- so even the table owner sees no rows unless app.company_id is set. The loop
-- sets that GUC per company — transaction-local, exactly as withTenant() does.
DO $$
DECLARE
  c RECORD;
  used INTEGER;
BEGIN
  FOR c IN SELECT "id" FROM "companies" LOOP
    PERFORM set_config('app.company_id', c."id", true);

    SELECT COUNT(*) INTO used
      FROM "chat_messages" m
      JOIN "chat_sessions" s ON s."id" = m."session_id"
      WHERE s."company_id" = c."id"
        AND m."role" = 'user'
        AND m."created_at" >= date_trunc('month', now());

    UPDATE "companies"
      SET "monthly_question_count" = used,
          "monthly_question_month" = to_char(now(), 'YYYY-MM')
      WHERE "id" = c."id";
  END LOOP;

  PERFORM set_config('app.company_id', '', true);
END $$;
