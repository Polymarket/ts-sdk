---
"@polymarket/client": minor
---

Allow supplying `tickSize` and `negRisk` in limit- and market-order prepare params to skip the per-order `tick-size` / `neg-risk` fetches. Latency-sensitive integrators that already stream a market's tick size and neg-risk can pass them to remove round-trips from the click-to-sign path. When omitted, the SDK fetches them as before, and the two fallback fetches now run in parallel instead of sequentially.
