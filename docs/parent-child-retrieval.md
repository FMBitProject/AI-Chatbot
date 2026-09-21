# Parent–child retrieval

New indexing embeds children up to 1,200 characters with 160-character overlap.
Parents are capped at 4,000 characters, with paragraph/sentence boundaries and
explicit Markdown section boundaries preferred. These are character budgets,
not measured token counts. PDF extraction currently produces plain text, so
semantic headings and table structure cannot always be recovered.

Only child text is embedded, using the existing pinned embedding model and
1,536 dimensions. Each child stores its parent's text and index. Repeating
parent text costs storage but keeps expansion within the same RLS-protected
row and atomic indexing write, without another table or cross-tenant lookup.

Chat, the public query API and both Slack entry points expand matched children.
Parents are deduplicated by document ID plus parent index and ranked by their
best child. The strongest child ID remains the citation identifier. Search
continues returning child excerpts. The public demo retains its existing
versioned seed and exact-content allowlist.

Expansion occurs only after tenant, department/folder, expiry, plan document
limits and similarity filters. Parent text is never a separate permission path.
Chat retains its dynamic character budget and count/document caps. API context
is capped at 8,000 characters/4 parents; Slack at 6,000 characters/3 parents.
Whole parents that do not fit are skipped, not truncated mid-procedure.
Candidate overfetch is bounded at 150; it improves parent diversity but does
not guarantee filling every result slot after filtering/deduplication.

## Rollout

1. Apply `0023_parent_child_chunks.sql` before deploying the code. It adds two
   nullable columns only; existing code and data continue to work. No backfill
   or provider call happens in the migration. Do not deploy new code first.
2. Deploy the code. Existing chunks with NULL parent fields remain searchable
   as before. New uploads use parent–child automatically.
3. Inspect an existing workspace with `npm run rag:reindex -- <company-id>`.
   Use `--apply` to queue only successful legacy documents with retained raw
   text. The existing admin indexing flow or cron drains the queue. Re-indexing
   spends embedding quota; the model is unchanged. Old chunks remain until the
   new children and parents are committed in the same transaction.

## Validation and limits

Offline tests cover section boundaries, bounded sizes, short tail preservation,
matching a child while retaining an exception elsewhere in its parent, parent
deduplication, legacy fallback and retrieval permission filters. They do not
prove higher semantic accuracy. Before tuning sizes, compare old vs new on real
SOP questions: complete procedures, exceptions, numbers and tables. Measure
answer completeness, source support, latency and token usage. Do not interpret
smaller chunks as an automatic improvement in retrieval precision.
