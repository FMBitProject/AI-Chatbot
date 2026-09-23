CREATE TABLE "document_index_chunks" (
	"document_id" text NOT NULL,
	"company_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"parent_text" text NOT NULL,
	"parent_index" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	CONSTRAINT "document_index_chunks_document_id_chunk_index_pk" PRIMARY KEY("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "indexing_provider_slots" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"lease_until" timestamp NOT NULL,
	"next_allowed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "indexing_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "document_index_chunks" ADD CONSTRAINT "document_index_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_index_chunks" ADD CONSTRAINT "document_index_chunks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_indexing_checked_idx" ON "companies" USING btree ("indexing_checked_at" NULLS FIRST,"id");--> statement-breakpoint
ALTER TABLE "document_index_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_index_chunks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_index_chunks_tenant_isolation" ON "document_index_chunks"
  USING ("company_id" = current_setting('app.company_id', true))
  WITH CHECK ("company_id" = current_setting('app.company_id', true));
