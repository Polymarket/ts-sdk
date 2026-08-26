---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add `listTradesV2` — the first v2 data surface wired end-to-end through the cursor pagination engine. Pages carry exact continuation signals (`hasMore`/server-minted `nextCursor`), every page re-sends the original filters, offset is not part of the vocabulary, and transient rate limits are retried after the server-requested delay. Bindings gain the normalized `TradeV2` row (snake_case wire → SDK vocabulary, epoch seconds → milliseconds, empty-string and 999-sentinel absence → `undefined`).
