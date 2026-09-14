CREATE TABLE "company_ai_providers" (
	"company_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"model" text NOT NULL,
	"last_tested_at" timestamp,
	CONSTRAINT "company_ai_providers_company_id_provider_pk" PRIMARY KEY("company_id","provider")
);
--> statement-breakpoint
CREATE TABLE "company_ai_settings" (
	"company_id" text PRIMARY KEY NOT NULL,
	"primary_provider" text,
	"fallback_provider" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_ai_providers" ADD CONSTRAINT "company_ai_providers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ai_settings" ADD CONSTRAINT "company_ai_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_ai_providers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "company_ai_providers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "company_ai_providers_tenant_isolation" ON "company_ai_providers"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
--> statement-breakpoint
ALTER TABLE "company_ai_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "company_ai_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "company_ai_settings_tenant_isolation" ON "company_ai_settings"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
