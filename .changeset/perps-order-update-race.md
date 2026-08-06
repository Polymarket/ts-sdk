---
"@polymarket/client": patch
---

Prevent Perps `placeOrder` from missing private order updates that arrive before the command acknowledgement. High-level placement now generates a client order ID when callers omit it.
