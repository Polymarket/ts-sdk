---
'@polymarket/client': patch
---

Mutations are no longer retried by the transport. Reads keep retrying twice by default; pass `retries` (0 to 5) per read to change that, such as `{ retries: 0 }` when a query library owns retries.
