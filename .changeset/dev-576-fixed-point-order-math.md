---
"@polymarket/client": patch
---

Accept order prices with insignificant floating-point drift from a valid tick-grid value, while continuing to reject materially off-grid prices. Calculate limit and market order amounts with exact fixed-point arithmetic to avoid unintended rounding caused by floating-point noise.
