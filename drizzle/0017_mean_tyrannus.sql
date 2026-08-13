CREATE TABLE "slack_installations" (
	"team_id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"team_name" text,
	"bot_token" text NOT NULL,
	"bot_user_id" text,
	"scopes" text,
	"installed_by_user_id" text,
	"installed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slack_user_id" text;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installations_company_idx" ON "slack_installations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "users_company_slack_idx" ON "users" USING btree ("company_id","slack_user_id");