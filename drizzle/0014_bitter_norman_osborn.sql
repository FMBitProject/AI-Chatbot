-- Creates the table better-auth's twoFactor plugin has needed since the day it
-- was enabled.
--
-- The plugin writes to two places: users.two_factor_enabled (which has always
-- existed) and this model (which never did). Every 2FA operation — enable,
-- disable, the OTP lockout counters, the sign-in TOTP check — resolves
-- "twoFactor" against the adapter's schema map and threw a BetterAuthError the
-- moment it was asked for. The failure surfaced as a 500 *after* the password
-- check passed, and the dialog's fallback toast translated that 500 into
-- "Password salah." — so the one person who saw the bug was told it was their
-- own typo.
--
-- Purely additive, and safe in either deploy order: the old code never touches
-- this table, the new code finds it empty and starts from zero. No user has
-- two_factor_enabled = true (verified 2026-08-07), so there is no half-enabled
-- state to reconcile.
--
-- The secret and backup codes arrive already encrypted (symmetricEncrypt with
-- BETTER_AUTH_SECRET) — this table never holds a usable seed in the clear.
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp
);
--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");
