---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: migrate open-interest and live-volume reads to their v2 contracts. Replace `listOpenInterest` with `fetchOpenInterest`, use condition and event identifiers, and expose cumulative taker volume explicitly.
