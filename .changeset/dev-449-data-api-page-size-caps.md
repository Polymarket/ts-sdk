---
"@polymarket/client": patch
---

Fix silent pagination truncation on data-backed list methods. The upstream service caps `limit` per endpoint, so a `pageSize` at or above the cap made the look-ahead probe come back clamped and pagination stopped after the first page without an error. `pageSize` is now validated against each endpoint's cap (`listPositions`, `listActivity`, `listMarketPositions` 499; `listClosedPositions` 49; `listTrades` 9,999; `listBuilderLeaderboard`, `listTraderLeaderboard` 49) and rejects invalid values with `UserInputError`. The `hasMore` probe is also clamp-tolerant now: a full page continues pagination instead of relying on the extra probe row, at the cost of one extra empty-page request when the total count is an exact multiple of `pageSize`.
