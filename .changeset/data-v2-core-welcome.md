---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add the core pieces for the data `/v2` surface: `/v2` envelope schemas (paginated list with server-minted branded cursors, and single-object including null answers), a `withRateLimitRetry` pipeline helper that honors server-requested delays, and the `MIGRATION` activity type with its `MigrationActivity` variant. All additive — no existing API shape changes.
