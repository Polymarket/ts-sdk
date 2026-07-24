---
"@polymarket/client": patch
---

Fix silent pagination truncation on offset-paginated list methods. The upstream services cap `limit` per endpoint, so a `pageSize` at or above the cap made the previous `pageSize + 1` look-ahead probe come back clamped and pagination stopped after the first page without an error. Offset pagination no longer sends the look-ahead probe: requests ask for exactly `pageSize` rows, a full page reports `hasMore: true`, and a collection ending exactly on a page boundary costs one extra empty final page. `pageSize` is now also validated against each endpoint's cap, rejecting invalid values with `UserInputError` instead of truncating silently: `listPositions`, `listActivity`, `listMarketPositions` 500; `listClosedPositions`, `listBuilderLeaderboard`, `listTraderLeaderboard`, `listSeries` 50; `listTrades` 10,000; `listTags`, `listComments`, `listCommentsByUserAddress`, `listTeams`, `listMarketClarifications` 100.
