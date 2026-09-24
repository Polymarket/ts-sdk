---
"@polymarket/bindings": minor
---

Add `REDEEMABLE_LOST` and `MERGEABLE` to the `PositionStatus` enum for `/v2/positions`: `REDEEMABLE_LOST` (still-held zero-payout positions) and `MERGEABLE` (live complementary pairs a wallet can merge back to collateral). Both are listing filters; the position row `status` field keeps reporting `OPEN | REDEEMABLE | CLOSED` and is now typed as `PositionRowStatus`.
