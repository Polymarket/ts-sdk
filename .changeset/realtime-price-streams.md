---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Replace RTDS with authenticated PolyBolt price streams, using the production endpoint by default.

Breaking changes:

- Use a secure client for all price subscriptions and provide explicit, nonempty symbol or asset filters.
- Replace `prices.crypto.binance` with `prices.crypto`, `prices.crypto.chainlink.twap` with `prices.crypto.twap`, and `prices.equity.pyth` with `prices.equity`. Feed symbols depend on the deployed source; there is no implicit symbol set.
- Rename `webSockets.rtds` to `webSockets.realtime`, `RtdsWebSocketManager` to `RealtimeWebSocketManager`, and environment overrides from `rtds` to `realtime: { ws, headers? }`.
- Remove `comments` and `prices.crypto.chainlink` subscriptions: these streams are unsupported. HTTP comments APIs remain available.
- Replace legacy RTDS binding imports with `CryptoPriceEvent`, `CryptoTwapPriceEvent`, `EquityPriceEvent`, and their corresponding subscription types. Crypto, TWAP, and equity streams include `subscribe` history snapshots and `update` events.

Add `prices.polymarket` best-bid-and-offer updates. Price values preserve decimal precision and timestamps represent producer time. Subscriptions await server acceptance, share connections, spread filters beyond the 64-key connection limit, reconnect automatically, and refresh history after reported drops. A rejected subscribe batch preserves unrelated subscriptions; new subscriptions reject if acceptance cannot complete within 30 seconds.
