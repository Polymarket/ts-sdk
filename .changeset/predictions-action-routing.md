---
'@polymarket/client': minor
---

Use the configured Predictions endpoint for supported discovery, trading, portfolio and wallet actions, including wallet-wide order listing and cancellation. API keys sign only the operations of their credential family, against the upstream method and path. Comment listings page by gateway cursor. Order heartbeats keep their direct endpoint.

**Breaking:** `EnvironmentConfigFork` no longer accepts `data`, `relayer`, `gamma`, `combos.rest`, `combos.builderGateway` or `combos.collateralReturn`, and the `CombosEndpoints` type is removed. Those endpoints no longer served any action. Point `predictions.rest` at the environment's gateway instead. `combos` keeps the quoter socket (`ws` and `headers`), and `clob` keeps order heartbeats and the market and user sockets.

**Breaking:** `listComments` no longer accepts `holdersOnly` or `getPositions`, because the gateway listing cannot serve them. `order` now takes `CommentSort.Id` or `CommentSort.CreatedAt`, the only orders a cursor walk supports. Every listing pages through the whole thread, so `listComments` no longer throws `PaginationLimitError` or reports `limitReached`. Offset cursors saved from earlier versions fail with `UserInputError`; start again from the first page.
