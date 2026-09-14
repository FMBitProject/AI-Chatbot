# Resolved MINOR findings

- Audit retry retains the failed cursor, so a failed "Load more" request resumes
  from the same page instead of replacing the list with the first page.
- Audit gates its empty state on loading and shows a localized loading status
  during the initial request.

Both findings were fixed after the CRITICAL and MEDIUM review work landed.
