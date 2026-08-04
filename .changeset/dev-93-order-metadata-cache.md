---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Cache market configuration used to prepare repeated limit and protected market orders. Unprotected market orders now derive price, tick size, and exchange selection from one live order-book response, while `maxSpend` preparations continue fetching current platform and builder fee inputs. Order-book tick sizes are normalized to supported numeric values.
