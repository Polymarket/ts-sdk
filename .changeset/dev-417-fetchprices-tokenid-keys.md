---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Strengthen the `fetchPrices` result type so price lookups are keyed by `TokenId` with partial `OrderSide` records containing decimal strings.
