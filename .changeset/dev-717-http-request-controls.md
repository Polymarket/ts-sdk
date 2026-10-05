---
'@polymarket/client': minor
---

Add client-level `fetch` and `retry` options and per-operation `AbortSignal` support
for HTTP reads. Custom fetch and retry settings survive authentication and client
extension. Cancelled reads reject with `RequestAbortedError`, preserving the abort
reason and stopping pagination and retry waits. Existing calls and default retry
behavior remain unchanged.
