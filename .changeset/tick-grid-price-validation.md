---
"@polymarket/client": patch
---

Reject limit and protected market order prices that are not a multiple of the market tick size. Previously, prices within the tick's decimal allowance but off the tick grid (for example `0.007` on a `0.005` tick market) passed client-side validation and were rejected by the exchange after signing.
