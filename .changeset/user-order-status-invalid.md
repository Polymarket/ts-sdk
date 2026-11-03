---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

User websocket channel order events with `status: "INVALID"`, a `CANCELED_` status with a reason, or a newly introduced status now parse and reach subscribers instead of being dropped. Known status constants are available through `KnownUserOrderStatus`; `UserOrderStatus` is the full status type, including future strings.
