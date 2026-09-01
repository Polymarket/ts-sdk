---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: migrate `fetchPortfolioValue` to its `/v2` contract, returning one numeric `PortfolioValue` and accepting `conditionId` instead of the legacy `market` filter. Add `fetchUserStats` with numeric profile and lifetime PnL fields, and remove `fetchTradedMarketCount`; use `fetchUserStats().trades` for the exact distinct-market count. The accounting snapshot download remains available unchanged.
