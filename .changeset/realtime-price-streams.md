---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Breaking migration: replace RTDS completely with authenticated PolyBolt price streams. The production endpoint is now `wss://ws-live-v2.polymarket.com/ws`, with no legacy fallback. Production price subscriptions require that endpoint to be deployed; use a staging environment fork while deployment is pending.

Migration:

- Use a secure client for all price subscriptions and provide explicit, nonempty symbol or asset filters.
- Replace `prices.crypto.binance` with `prices.crypto`, `prices.crypto.chainlink.twap` with `prices.crypto.twap`, and `prices.equity.pyth` with `prices.equity`. Feed symbols depend on the deployed source; there is no implicit symbol set.
- Use `webSockets.realtime` and `RealtimeWebSocketManager`. Remove `webSockets.rtds`, `RtdsWebSocketManager`, and `RtdsWebSocketManagerOptions` references.
- Move environment overrides from `rtds` to `realtime: { ws, headers? }`. Remove `protocol` and `rtdsLegacy`; there is only one price transport.
- Remove `comments` and `prices.crypto.chainlink` subscriptions: these streams are unsupported. HTTP comments APIs remain available.
- Replace legacy comment/reaction event, `CryptoPrices*`, `EquityPrices*`, and `RealtimeEvent` binding imports with the source-neutral price event/spec types. The legacy RTDS schemas and price payload types are removed.
- Handle both `subscribe` history snapshots and `update` events for crypto, TWAP, and equity. Remove `includeSnapshot`; snapshots are included by default. Use `CryptoPriceEvent`, `CryptoTwapPriceEvent`, and `EquityPriceEvent` with the corresponding subscription types.

Add secure `prices.polymarket` best-bid-and-offer updates with `PolymarketPriceEvent` and `PolymarketPriceSubscription`. Price values preserve exact decimal precision, timestamps represent producer time, and events expose optional `seq` and `dropped` fields. Subscriptions await server acceptance and can throw `SubscriptionRejectedError` or `ConnectionLostError`. Connections authenticate on reconnect, pool filters beyond 64 keys, and refresh history after reported drops.
