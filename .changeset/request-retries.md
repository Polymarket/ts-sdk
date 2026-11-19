---
'@polymarket/client': patch
---

Mutations and workflow requests, such as Perps credential checks, are never retried by the transport. Reads keep retrying twice by default; pass `retries` (0 to 5) per read to change that, such as `{ retries: 0 }` when a query library owns retries.

The experimental `predictions` service client gains `put`, and its `post` accepts `retries` (0 to 5, default 0) for requests that are safe to replay. A PUT is sent once, like other mutations, and a secure client replays it once after an expired access token. Reads that use POST, such as fetching several order books or prices at once, keep the read default.
