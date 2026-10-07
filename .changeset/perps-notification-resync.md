---
'@polymarket/bindings': patch
'@polymarket/client': patch
---

Emit server notification resync signals through the Perps session iterator with
`reason: 'server'`, the catch-up sequence, and the server timestamp. Backfill from
the last processed notification sequence and deduplicate by notification id.
