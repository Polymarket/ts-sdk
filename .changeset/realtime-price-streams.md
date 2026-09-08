---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add authenticated, source-neutral realtime price subscriptions: `prices.crypto`, `prices.crypto.twap`, `prices.equity`, and `prices.polymarket`, with `webSockets.realtime` and `RealtimeWebSocketManager`.

The new transport is opt-in through an environment fork (`rtds.protocol: 'polybolt'` and its WebSocket URL). Production keeps its existing streams. New topics require a secure client and explicit nonempty symbol or asset filters. When opting into the new transport, source-named price aliases also require a secure client and explicit symbols; their topic literals remain unchanged. Existing production subscriptions retain their current access and optional filters until the default migration release.

New vendor topics include recent-history snapshot events. Crypto aliases include snapshots only with `includeSnapshot: true`; equity retains its existing event types. Events expose optional `seq` and `dropped`, preserve exact decimal prices, and use producer event timestamps. Subscriptions await server acceptance and can throw `SubscriptionRejectedError` or `ConnectionLostError`. Connections authenticate again on reconnect, pool filters beyond 64 keys, and refresh history after reported drops.

Deprecate source-named aliases and `rtds` in favor of the neutral names, with removal two months after the future default migration release. Comments and the chainlink spot topic remain on the legacy stream until its shutdown. The default migration, dated removals, and production rollout remain gated on live feed coverage and production readiness.
