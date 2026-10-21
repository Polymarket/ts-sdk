---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

User websocket channel order events with `status: "INVALID"` (orders the system removes) or a `CANCELED_` status with a reason (eg `CANCELED_MARKET_RESOLVED`) now parse and reach subscribers instead of being dropped.
