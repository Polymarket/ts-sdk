---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Type CLOB cancellation results with a branded `OrderId`. `CancelOrdersResponse` now exposes `canceled` as `OrderId[]` and keys `notCanceled` by `OrderId` across `cancelOrder`, `cancelOrders`, `cancelMarketOrders`, and `cancelAll`. Runtime values and wire shapes are unchanged; the new `OrderId` type, `toOrderId`, and `OrderIdSchema` are exported from `@polymarket/bindings`.
