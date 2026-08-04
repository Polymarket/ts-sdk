---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Cache order-flow market metadata and builder fee rates per client instance. Repeated orders on the same market now skip redundant metadata requests: a warm limit order posts with a single request and a warm market order only refetches the live order book. Condition IDs and neg-risk flags are cached for the client lifetime; tick sizes, platform fee info, and builder fee rates refresh lazily after an internal TTL. Market orders also resolve metadata, book depth, and builder fee rates in parallel, and builder fee rates are only fetched for BUY orders capped by maxSpend. Price validation self-heals from tick-grid staleness: since tick sizes only shrink, a price rejected by a cached grid triggers one metadata refresh (rate-limited by an internal holdoff) and revalidates before surfacing an error. MarketInfoSchema now parses the market-level tick size (mts) and negative-risk flag (nr).
