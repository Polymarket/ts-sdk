---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

RequestRejectedError now exposes a typed restriction distinguishing matching-engine restarts (HTTP 425) from post-only mode (HTTP 503), its retryAfter value falls back to the retry_after_seconds response field when the Retry-After header is absent, and batch post-only rejections map to the post_only_mode order error code instead of unknown. The SDK still does not retry automatically.
