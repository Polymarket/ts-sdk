---
"@polymarket/client": patch
"@polymarket/bindings": patch
---

Normalize Perps trading commands to match the rest of the SDK: place and modify orders now use `OrderSide`, place, modify, and cancel return per-item acknowledgement unions, and leverage and margin updates return `void` while throwing `RequestRejectedError` when rejected. Clean up the `PerpsInstrument` type, including a typed `PerpsFundingInterval` string format.
