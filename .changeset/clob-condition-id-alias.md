---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Add a `conditionId` alias to the CLOB order book, open order, trade, and builder trade shapes, carrying the same value as `market`, and mark `market` deprecated. `market` on these types holds a CTF condition id; `conditionId` names it consistently with the rest of the SDK. Additive and non-breaking: both fields are emitted.
