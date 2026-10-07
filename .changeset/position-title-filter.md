---
'@polymarket/client': minor
---

Add a case-insensitive `title` filter to `listPositions`. Preserve title
patterns across pagination, including cursor replay, and validate the limit
of 200 Unicode characters while treating blank input as absent.
