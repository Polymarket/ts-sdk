---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Fix Perps trades subscriptions silently dropping every frame. The `trades::<instrumentId>` channel delivers a batch of trades in `data`, but the event schema only accepted a single object, so `safeParse` failed and no trade events were emitted. Each frame is now emitted as one event whose payload is the list of trades.
