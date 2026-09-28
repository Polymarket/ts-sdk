---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Expose the source of realtime price updates and history snapshots. Known sources
are available through `KnownPriceSource`, while `PriceSource` accepts future source
names. Cached history starts fresh when the source changes.
