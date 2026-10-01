---
"@polymarket/client": patch
---

`RequestRejectedError.retryAfter` and `RateLimitError.retryAfter` now also honor the HTTP-date form of the `Retry-After` header, converted to whole seconds from now and never below zero, instead of dropping it. The existing retry policy and the set of retried requests are unchanged.
