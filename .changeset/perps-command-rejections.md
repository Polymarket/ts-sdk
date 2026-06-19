---
"@polymarket/client": patch
"@polymarket/bindings": patch
---

Add bespoke Perps trading acknowledgement unions and return per-item place, modify, and cancel acknowledgements. Perps leverage and margin updates now return `void` and throw `RequestRejectedError` when their command acknowledgement is rejected. Perps instrument responses now expose `id` instead of `instrumentId` and omit `instrumentType`.
