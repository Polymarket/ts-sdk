---
"@polymarket/client": patch
"@polymarket/bindings": patch
---

Normalize Perps trading command responses to match the rest of the SDK: place, modify, and cancel now return per-item acknowledgement unions, while leverage and margin updates return `void` and throw `RequestRejectedError` when rejected. Clean up the `PerpsInstrument` type.
