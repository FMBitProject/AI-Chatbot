ALTER TABLE "document_chunks" ADD COLUMN "parent_text" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "parent_index" integer;