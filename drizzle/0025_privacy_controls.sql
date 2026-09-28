CREATE TABLE "company_privacy" (
	"company_id" text PRIMARY KEY NOT NULL,
	"allowed_providers" text[] DEFAULT ARRAY['groq','google','openai','anthropic']::text[] NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_events" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"action" text NOT NULL,
	"provider" text,
	"purpose" text,
	"document_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "privacy_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "classification" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_privacy" ADD CONSTRAINT "company_privacy_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_events" ADD CONSTRAINT "privacy_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_events_company_created_idx" ON "privacy_events" USING btree ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "company_privacy" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "company_privacy" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "company_privacy_tenant_isolation" ON "company_privacy"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
--> statement-breakpoint
ALTER TABLE "privacy_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "privacy_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "privacy_events_tenant_isolation" ON "privacy_events"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_classification_check" CHECK ("classification" IN ('normal','internal','confidential'));
