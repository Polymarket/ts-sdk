---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Accept the `pre_ipo` Perps instrument category and preserve future category strings in instrument reads, category filters, and fee schedules so new categories cannot invalidate entire responses. Expose optional, nullable instrument fee overrides and funding multipliers with normalized field names.
