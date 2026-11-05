---
'@polymarket/client': patch
'@polymarket/bindings': patch
---

Reduce retained heap after importing `@polymarket/client` by about 20%.
Require `zod@^4.6.7` to address GHSA-mrhx-c7xc-m3w5.

Input that exceeds a collection limit, such as more than 15 orders in
`postOrders`, now fails on the limit alone, without per-item errors. When
invalid input is closest to one accepted shape, `UserInputError` now lists
only that shape's issues.
