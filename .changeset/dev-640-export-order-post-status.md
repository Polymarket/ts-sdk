---
"@polymarket/client": patch
---

Re-export the `OrderPostStatus` enum from `@polymarket/client`, so consumers can compare `AcceptedOrderResponse.status` without importing from `@polymarket/bindings/clob`.
