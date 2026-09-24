---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Align the positions layer with the five `status` filters. `Position.status` is now `PositionRowStatus` (`OPEN | REDEEMABLE | CLOSED`), the states a row can actually report — `REDEEMABLE_LOST` and `MERGEABLE` are request vocabulary only. `listPositions` documents all five values and the `MERGEABLE` → `TOKENS` sort default, and rejects `REDEEMABLE_LOST` without a `user` locally instead of letting the request 400.
