# Security fixes

- `role` and `companyId` are server-managed Better Auth fields. Public
  `/api/auth/sign-up/email` is disabled; workspace and employee creation use
  `createCredentialAccount` and an atomic neon-http batch. Passwords use Better
  Auth's scrypt implementation. A unique-email conflict rolls back the entire
  batch without adopting or deleting any existing account.
- Verification email is sent after signup commits. If delivery fails, the UI
  explains that the account exists and links to login for verification resend.
- Password policy is enforced in the auth before hook for reset/change/set
  endpoints. Password reset revokes sessions; cookie session caching is disabled
  so revoked cookies cannot continue to authorize requests.
- Document access is explicit: admins and workspace API keys can read the
  workspace; employees see shared documents plus their assigned department.
  An employee without a department sees shared documents only. Chat's catalog,
  search, retrieval, and both Slack entry points use this rule.
- Rate limits use atomic PostgreSQL upserts in existing `verifications` rows,
  with `rate-limit:` identifiers and hashed bucket keys. They share counters
  across server instances and fail closed on storage errors. Bounded cleanup
  removes expired rate-limit rows only; auth verification rows are untouched.
  This adds a database round trip to each limited request. No migration or new
  production environment variable is required.

Run `npm run test:security:integration` for isolated PostgreSQL (PGlite) tests.
The test hook replaces database and mail modules and blocks network access.
These tests also run as part of `npm test`. They do not verify production RLS
deployment or browser behavior.

The CSP hardening finding remains deferred in `review-todo.md`.
