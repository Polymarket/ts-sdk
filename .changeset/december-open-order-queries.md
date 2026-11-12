---
"@polymarket/client": patch
"@polymarket/bindings": patch
---

Prepare for the December 14 order-query changes. Open-order queries filtered by `assetId` or the deprecated `tokenId` alias now require a nonblank market condition ID in `market`; invalid queries throw `UserInputError` before sending a request. Unfiltered and market-only queries remain supported.

Accept order responses without the deprecated `associate_trades` field, defaulting `associateTrades` to an empty array while preserving legacy values. Track cumulative fills with `sizeMatched` or individual fills with `listAccountTrades()`, matching `takerOrderId` or `makerOrders[].orderId` to the order ID. An empty `associateTrades` array does not mean an order has no fills.
