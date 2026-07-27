---
"@polymarket/client": patch
---

Stop populating `Page.totalCount` from the per-response `count` on cursor-paginated endpoints (open orders, account trades, earnings, builder lists). That value was the current page's item count, not a total across all pages.
