-- Individual accounts: one person, one workspace, no employees.
--
-- A `companies` row has always been the tenant — the key documents, chunks, chat
-- sessions and transactions all hang off — rather than literally an
-- organisation. This column makes that explicit instead of splitting the table:
-- a second tenant key would have to be threaded through RLS, retrieval, quota
-- accounting and the payment webhook, and one key is exactly what makes those
-- four safe today.
--
-- Existing rows are all organisations, which is why 'company' is the default and
-- why this needs no backfill.
--
-- Order matters below. The unique constraint has to go before the partial index
-- can replace it, and the column has to exist before the index can be predicated
-- on it.
ALTER TABLE "companies" DROP CONSTRAINT "companies_name_unique";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "account_type" text DEFAULT 'company' NOT NULL;--> statement-breakpoint
-- Company names stay unique; personal names do not.
--
-- Uniqueness over the whole column is right for organisations — the same clinic
-- registering twice is nearly always one customer locked out of their own
-- account — and wrong for people. There are a great many Indonesians named Budi
-- Santoso, and under the old constraint the second one to sign up would have
-- been told his name was already taken, with nothing on the form he could
-- change.
--
-- Safe to build: every row at this point is 'company', and the constraint just
-- dropped already proved those names unique, so there is nothing to deduplicate.
CREATE UNIQUE INDEX "companies_name_unique_company" ON "companies" USING btree ("name") WHERE "companies"."account_type" = 'company';
