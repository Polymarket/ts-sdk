---
"@polymarket/client": patch
---

Make Perps session `placeOrder` wait for the first matching orders update, rename ack-only batch placement to `postOrders`, normalize Perps order entity ids as `id`, and type order statuses with `PerpsOrderStatus`.
