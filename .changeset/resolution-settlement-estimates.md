---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Expose optional resolution settlement estimates and their basis through
`expectedSettlementTime` and `settlementTimeBasis`, with the public
`ResolutionSettlementTimeBasis` enum. Estimates are earliest settlement times,
not guaranteed deadlines.
