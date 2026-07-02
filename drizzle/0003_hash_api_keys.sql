-- API keys are no longer stored in plaintext. We keep only a SHA-256 hash
-- (looked up on each API request) plus a short prefix for display. Existing
-- rows are backfilled by hashing their current plaintext value in place, so
-- previously issued keys keep working after this migration.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_hash" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_prefix" text;--> statement-breakpoint
UPDATE "api_keys"
  SET "key_hash" = encode(digest("key", 'sha256'), 'hex'),
      "key_prefix" = substring("key" from 1 for 12);--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "key_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "key_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash");--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "key";
