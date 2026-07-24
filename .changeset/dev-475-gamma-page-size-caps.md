---
"@polymarket/client": patch
---

Fix silent pagination truncation on the remaining offset-paginated list methods, matching the fix already applied to data-backed methods. The upstream service silently clamps `limit` per endpoint, so a `pageSize` at or above the cap made the look-ahead probe come back clamped and pagination stopped after the first page without an error. `pageSize` is now validated against each endpoint's cap (`listTags`, `listComments`, `listCommentsByUserAddress`, `listTeams`, `listMarketClarifications` 99; `listSeries` 49) and rejects invalid values with `UserInputError`. The `hasMore` probe on these methods is also clamp-tolerant now: a full page continues pagination instead of relying on the extra probe row, at the cost of one extra empty-page request when the total count is an exact multiple of `pageSize`.
