-- Records why an upload failed, so the admin sees the reason in the document
-- list instead of a bare "Gagal" badge. Nullable and additive: existing rows
-- (including already-failed ones, whose reason is only in the logs) read NULL
-- and the UI just shows the badge alone, exactly as before.

ALTER TABLE "documents" ADD COLUMN "error_message" text;