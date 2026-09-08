CREATE INDEX "chat_messages_session_role_created_idx" ON "chat_messages" USING btree ("session_id","role","created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_user_company_idx" ON "chat_sessions" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_company_idx" ON "chat_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "document_chunks_company_idx" ON "document_chunks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "documents_company_created_idx" ON "documents" USING btree ("company_id","created_at","id");