---
'@polymarket/client': patch
'@polymarket/bindings': patch
---

Preserve server retryable, trace ID and parameter diagnostics on HTTP rejection and rate-limit errors, including the x-trace-id fallback, without changing automatic retry policy.
