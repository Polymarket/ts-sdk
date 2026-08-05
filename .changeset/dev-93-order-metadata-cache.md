---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Cache market configuration and platform fees used to prepare repeated orders. If cached tick metadata rejects a limit or protected price, the SDK fetches current metadata and validates once more before returning the input error. Unprotected market orders now derive price, tick size, and exchange selection from one live order-book response, while attributed `maxSpend` preparations continue fetching current builder fees. Order-book tick sizes are normalized to supported numeric values.
