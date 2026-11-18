---
'@polymarket/client': patch
---

Service clients' `post` accepts `retries` (0 to 5, default 0), so a POST that is safe to replay can retry like a read. Reads whose endpoint requires POST, such as fetching several order books or prices at once, keep retrying twice by default and accept the same `retries` option as other reads.
