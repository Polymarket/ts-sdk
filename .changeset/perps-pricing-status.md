---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Preserve optional pricing safety status on REST and streaming tickers as `pricingStatus`, with nullable provenance and exposure restrictions without fabricated defaults. Pricing mode, reason and index source accept values the SDK does not enumerate yet; known values are listed in `PerpsKnownPricingMode`, `PerpsKnownPricingReason` and `PerpsKnownPricingIndexSource`.
