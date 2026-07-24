---
"@polymarket/client": patch
---

RequestRejectedError and RateLimitError now expose retryAfter, populated from the Retry-After response header, so callers can honor server-provided backoff.
