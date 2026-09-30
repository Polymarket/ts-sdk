---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add owner-signed Perps internal transfers and normalized transfer history.

Preserve submillisecond transfers at history page boundaries. If a full
millisecond cannot be paged safely, report an error instead of omitting records.
