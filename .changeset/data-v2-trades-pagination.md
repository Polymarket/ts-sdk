---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: `listTrades` is fully replaced — same name, new contract. It now serves exact continuation signals (`hasMore`/server-minted `nextCursor` — no page-size probing), re-sends the original filters with every page, has no offset vocabulary (`pageSize` default 100, max 1000 rejected-not-clamped), retries transient rate limits after the server-requested delay, and accepts partial `filterType`/`filterAmount` (the service fills the other half in). The `Trade` row is strict and normalized (numbers for `size`/`price`, epoch milliseconds, empty-string and unknown-sentinel absence as `undefined`). Following the service's naming remap, the request filter is `conditionId` (the wire's `condition`/`condition_id` — the old `market` key no longer exists upstream) and the row field parsed is `condition_id`. Bindings gain the reusable data envelope parsers (`dataPageSchema`, `dataEnvelopeSchema`) that turn the service's paginated envelope straight into the SDK page shape.
