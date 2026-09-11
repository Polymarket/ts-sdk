---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add opt-in PolyBolt price streams alongside the existing RTDS transport.

New PolyBolt topics:

- `prices.polymarket` is public and delivers current best-bid-and-offer snapshots plus updates.
- `prices.crypto`, `prices.crypto.twap`, and `prices.equity` require a secure client and explicit, nonempty filters.
- `prices.crypto.twap` supports the deployed 60-second series only. Crypto symbols use the lowercase `<base>usd` wire spelling, such as `btcusd`; a legacy trailing `usdt` is normalized to `usd`. See the [real-time data catalog](https://docs.polymarket.com/market-data/realtime-data).
- SDK topic names are plural while PolyBolt wire channels are singular: for example, `prices.crypto` maps to `price.crypto`.

The PolyBolt transport is available through `webSockets.realtime` and the
`realtime: { ws, headers? }` environment entry. Price values preserve decimal
precision and timestamps represent producer time. Subscriptions await server
acceptance, share connections, spread filters beyond the 64-key connection
limit, reconnect automatically, and report slow-reader drops without forcing a
resubscription. Unambiguously identified per-item batch errors do not terminate
accepted siblings.

For release compatibility, `webSockets.rtds`, `RtdsWebSocketManager`, the
`rtds` environment entry, `comments`, and the source-named RTDS price topics
remain available for one release and are deprecated. Existing applications can
continue using RTDS while PolyBolt production access and authenticated CLOB
verification are rolled out.
