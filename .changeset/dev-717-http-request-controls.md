---
'@polymarket/client': minor
---

Add experimental client-level `fetch` and `retry` options and per-operation
`AbortSignal` support for HTTP reads. Custom fetch and retry settings survive
authentication and client extension. Cancelled reads reject with
`RequestAbortedError`, preserving the abort
reason and stopping pagination and retry waits. Existing calls and default retry
behavior remain unchanged.

These HTTP request controls, including `RequestAbortedError`, may change in a
breaking way in any release, including patch releases.
