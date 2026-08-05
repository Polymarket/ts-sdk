---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Cache market configuration used to prepare repeated limit and protected market orders. If cached tick metadata rejects a limit or protected price, the SDK fetches current metadata and validates once more before returning the input error. Unprotected market orders now derive price, tick size, and exchange selection from one live order-book response, while `maxSpend` preparations continue fetching current platform and builder fee inputs. Order-book tick sizes are normalized to supported numeric values.
