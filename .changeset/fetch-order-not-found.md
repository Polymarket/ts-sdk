---
"@polymarket/client": patch
"@polymarket/bindings": patch
---

`fetchOrder` now throws `RequestRejectedError` with status `404` when the order is not found, instead of `UnexpectedResponseError`.
