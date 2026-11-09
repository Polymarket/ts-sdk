---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add `shares` to `ConversionActivity` with the number of shares converted. `amount` is unchanged and now documents what it carries: the collateral the conversion released in USD. It is 0 for single-outcome conversions and for protocol v2 conversions, so read `shares` for the converted quantity.
