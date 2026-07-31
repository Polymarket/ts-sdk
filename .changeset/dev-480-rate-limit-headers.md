---
"@polymarket/client": patch
---

RateLimitError now exposes the Poly-RateLimit-\* state reported with a rejection, and clients accept an onRateLimitUpdate listener that receives per-signer rate-limit state (remaining, reset, tier, warning) whenever a response reports it.
