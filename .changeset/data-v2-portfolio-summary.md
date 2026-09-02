---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: migrate `fetchPortfolioValue` to its `/v2` contract, returning one `PortfolioValue` with a decimal-string value and accepting `conditionIds` instead of the legacy `market` filter. Add `fetchUserStats` with decimal-string money, size, and PnL fields, and remove `fetchTradedMarketCount`; use `fetchUserStats().tradedMarketCount` for the exact distinct-market count. The accounting snapshot download remains available unchanged.
