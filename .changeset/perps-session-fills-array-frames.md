---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Fix Perps session dropping every fill event. The private `fills` channel delivers all fills from a single match event as a batch in `data`, but the session event schema only accepted a single object, so `safeParse` failed and no fill events were emitted while order, balance, and portfolio events arrived normally. Fill frames are now fanned out into one event per fill.
