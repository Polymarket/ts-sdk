---
'@polymarket/bindings': patch
'@polymarket/client': patch
---

Accept current terminal Perps order statuses in order history and private order
updates, including instrument retirement, fill-time margin failures, and order
limits. Valid terminal updates now resolve order placement instead of timing out.
