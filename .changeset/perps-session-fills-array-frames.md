---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Fix Perps sessions dropping every fill event. The private `fills` channel delivers all fills from a single match event as a batch in `data`, but the session event schema only accepted a single object, so `safeParse` failed and no fill events were emitted while order, balance, and portfolio events arrived normally. Each frame is now emitted as one event whose payload is the list of fills.
