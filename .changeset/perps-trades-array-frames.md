---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Fix Perps trades subscription silently dropping every frame. The `trades::<instrumentId>` channel delivers a batch of trades in `data`, but the event schema only accepted a single object, so `safeParse` failed and no trade events were emitted. Trade frames are now fanned out into one event per trade.
