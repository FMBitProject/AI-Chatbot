# Deferred MINOR findings

- Audit retry still starts at the first page after a "Load more" failure.
  Follow-up: retain the failed cursor and retry that page.
- Audit still shows its empty-state message during the initial request.
  Follow-up: gate the empty state on loading and add a loading indicator.

These two behaviors were deliberately left unchanged while fixing the
CRITICAL and MEDIUM review findings.
