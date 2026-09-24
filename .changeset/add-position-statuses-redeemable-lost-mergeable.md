---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add `REDEEMABLE_LOST` and `MERGEABLE` to `PositionStatus` as `listPositions` filters. `REDEEMABLE_LOST` lists still-held zero-payout positions and requires `user`, so a request without one now fails locally with `UserInputError`. `MERGEABLE` lists live complementary pairs a wallet can merge back to collateral, sorted by `TOKENS` by default. Without `user` it falls back to the broader `OPEN` listing. Rows still report only `OPEN`, `REDEEMABLE`, or `CLOSED`, so `Position.status` is now typed as `PositionRowStatus`. Lost rows report `REDEEMABLE` and mergeable rows report `OPEN`.
