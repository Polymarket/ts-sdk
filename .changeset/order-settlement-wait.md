---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add `client.waitForOrderFillSettlement(order)`, which waits until every fill listed in an order response reaches a terminal settlement outcome and returns the settlement transaction hashes. Matched order responses are no longer guaranteed to include `transactionsHashes`; use this method to obtain hashes reliably. `ClobTrade.status` is now typed as the shared `TradeStatus` enum instead of a bare string.
