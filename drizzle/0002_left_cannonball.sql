-- Retrieval now uses the native `embedding` vector column; the legacy JSON-text
-- embeddings are dead data after the backfill. IF EXISTS keeps this idempotent.
ALTER TABLE "document_chunks" DROP COLUMN IF EXISTS "embedding_json";