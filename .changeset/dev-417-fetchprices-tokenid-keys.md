---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Strengthen CLOB batch price read result types so midpoint, price, and spread lookups are keyed by `TokenId`. `fetchPrices` now returns partial `OrderSide` records containing decimal strings, while `fetchMidpoints` and `fetchSpreads` return token ID keyed decimal strings.
