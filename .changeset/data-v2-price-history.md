---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: replace `fetchPriceHistory` with cursor-paginated `listPriceHistory`, using token IDs, strict time selections, second-based bucket widths, and normalized price points.
