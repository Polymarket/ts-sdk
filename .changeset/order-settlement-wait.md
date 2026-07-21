---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add `client.waitForOrderSettlement(order)`, which waits until every fill of a placed order is confirmed on-chain and returns the settlement transaction hashes. Matched order responses are no longer guaranteed to include `transactionsHashes`; use this method to obtain hashes reliably. `ClobTrade.status` is now typed as the shared `TradeStatus` enum instead of a bare string.
