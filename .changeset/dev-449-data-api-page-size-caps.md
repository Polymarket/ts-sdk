---
"@polymarket/client": patch
---

Fix offset-paginated list methods silently stopping after the first page when `pageSize` reached the server's limit cap.

- `pageSize` is now validated per endpoint and rejects values above the cap with `UserInputError`: 500 for `listPositions`, `listActivity`, `listMarketPositions`; 100 for `listTags`, `listComments`, `listCommentsByUserAddress`, `listTeams`, `listMarketClarifications`; 50 for `listClosedPositions`, `listBuilderLeaderboard`, `listTraderLeaderboard`, `listSeries`; 10,000 for `listTrades`.
- Requests fetch exactly `pageSize` rows instead of probing with `pageSize + 1`. A full page reports `hasMore: true`; when a collection ends exactly on a page boundary, the final page is empty.
