# Backend API contracts

The public integration API is described in [openapi.yaml](openapi.yaml).
Create a key in the admin dashboard and send `Authorization: Bearer <key>`.
Keys can retrieve administrator-visible documents for their workspace; never
embed a key in a public browser application.

Example body for `POST /api/v1/query`:

```json
{"question":"What is our leave policy?","language":"en"}
```

The default v1 contract preserves legacy error strings and top-level quota
`limit`/`period`. Existing exception responses retain their structured envelope.
Clients can opt into consistent structured errors by sending
`X-IntelliBase-Error-Format: structured`. In that mode, read `error.code`,
`error.message`, and optional `error.details`. Success fields are unchanged.
Future breaking public API changes should use a new URL version and document
the migration and retirement date before removing the old version.

Burst limits are shared across all API keys in a workspace: 20 authenticated
attempts per 60-second fixed window. Invalid-key attempts are limited by IP
after 10 attempts per 60 seconds. `429` responses include `Retry-After` in
seconds. Question quotas reset on UTC day/month boundaries. Retry transient
failures with backoff and jitter; there is no request-idempotency guarantee.

## Internal collection endpoints

Documents, users, chat sessions, session messages, and audit history accept
`limit` (1–100, default 100) and an opaque `cursor` from the previous response.
The response remains an array. `X-Next-Cursor` is present only when another
page exists. Requests return at most `limit` records, with private/no-store
cache control. Invalid pagination parameters return 400.

Documents, users, sessions, and messages sort by creation time then ID,
ascending; audit history sorts descending. Message timestamp ties put users
before assistants (reversed in audit history), then sort by ID. Cursors preserve
the exact database timestamp, including microseconds. Removing earlier rows
does not shift the continuation; rows inserted before the cursor appear on the
next refresh, not as duplicates in subsequent pages. This is still a live view,
not a snapshot export. Offset requests are rejected.

The dashboard and chat client follow continuation headers. Audit history loads
additional pages on demand. Its `q` parameter searches message text and user
names in the database before pagination, with a 200-character bound and literal
substring matching. Audit displays each message with its role and session ID;
it does not infer question/answer pairs from adjacent rows. Historical data has
no reliable reply-to relation, so presenting guessed pairs is unsafe.
The list helper retains accumulated pages while retrying 429 responses according
to Retry-After (up to five retries per page), and supports request cancellation.
These internal routes are deployed with their UI consumers and are not part of
the versioned public integration contract. Legacy internal error shapes remain
supported by the shared client error reader.

## Indexing

`POST /api/admin/indexing` requires a JSON object: `{}` drains the queue;
`{"documentId":"..."}` first retries a document. Malformed JSON, null, arrays,
and invalid supplied document IDs return 400 without starting indexing.

## Local verification

`npm run test:api-design` tests the actual indexing/query handlers with isolated
PostgreSQL and stubbed AI services. `npm run test:security:integration` also
checks concurrent seat creation. Neither suite connects to production.

Deferred MINOR review items are tracked in [api-review-todo.md](api-review-todo.md).
