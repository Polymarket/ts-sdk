---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add authenticated PolyBolt price streams through `client.subscribe()`, using
production automatically: `prices.crypto`, `prices.crypto.twap`, and
`prices.equity`. Subscriptions include history snapshots and live updates with
exact decimal prices, share connections, and reconnect automatically.
Event `seq` values are scoped to one channel on one WebSocket connection and
reset after reconnecting. Subscriptions with more than 64 filters use multiple
connections, so their sequence values may interleave in the merged stream.

Crypto topics require explicit canonical USD symbols such as `btcusd`;
`btc/usd` and `btcusdt` are rejected. TWAP uses a fixed 60-second window with
no window input. Returned TWAP events retain `windowSeconds: 60`.
Server rejections use `RequestRejectedError` with a machine-readable `code`.

Legacy RTDS price topics remain deprecated for compatibility, with removal
planned one month after the 0.11.0 release. Migrating from Binance USDT prices
changes the quote currency to USD as well as the feed source. The 30-second
TWAP has no PolyBolt replacement. See the [migration guide](https://docs.polymarket.com/api-reference/live-data/migrating-from-rtds#migrate-sdks-to-polybolt).
