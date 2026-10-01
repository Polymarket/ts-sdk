---
"@polymarket/client": patch
---

Route splitting, merging, and redeeming positions solely by market version: `v1` uses CTF and `v2` uses Protocol V2. Raise `UnexpectedResponseError` when the version or selected protocol's IDs are missing.
