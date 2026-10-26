---
'@polymarket/client': minor
---

**Breaking:** reads no longer retry by default. `retries` now defaults to 0 instead of 2. To keep the previous behavior, pass `{ retries: 2 }` to each read. Mutations are never retried.
