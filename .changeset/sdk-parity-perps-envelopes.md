---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Preserve exchange event horizons independently of send time across existing Perps update and recovery streams. Server-originated events expose `eventTimestamp: EpochMilliseconds | null`, normalizing the wire zero sentinel to `null` for an unknown horizon; local synthetic recovery does not invent one. Perps remains experimental.
