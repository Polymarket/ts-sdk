---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

RequestRejectedError now exposes a typed restriction distinguishing matching-engine restarts (HTTP 425) from cancel-only and post-only modes (HTTP 503), RequestRejectedError and RateLimitError retryAfter falls back to the retry_after_seconds response field when the Retry-After header is absent, and batch post-only rejections map to the post_only_mode order error code instead of unknown. The SDK still does not retry automatically.
