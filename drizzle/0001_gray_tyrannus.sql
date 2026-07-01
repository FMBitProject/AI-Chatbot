-- pgvector: required for the vector(1536) column and the hnsw index below.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
-- IF NOT EXISTS guards make this migration safe against prior schema drift
-- (e.g. two_factor_* columns already added to production via db:push).
ALTER TABLE "document_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "raw_text" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_factor_secret" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
