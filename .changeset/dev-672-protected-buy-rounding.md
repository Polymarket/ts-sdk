---
"@polymarket/client": patch
---

Round protected market BUY shares down so orders can match at `maxPrice` without increasing the signed spend. Validate the final fee-adjusted amounts against the finest supported price tick, refreshing market metadata once before rejecting an amount that cannot safely preserve the price bound.
