---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Normalize empty-string optional decimal fields on streamed market and trade events to null (for example a trade's `feeRateBps` and a price change's `bestBid`/`bestAsk`), so consumers never receive `''` where a decimal string or null is expected.
