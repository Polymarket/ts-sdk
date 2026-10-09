---
'@polymarket/client': patch
---

Document realized-PnL ordering for wallet-anchored closed-position listings that request tokens, current value, price or unrealized PnL. Preserve the requested filters and sort on cursor replay. When an obsolete cursor is rejected because its ordering changed, callers must discard it and start a new first page; pagination preserves the rejection and does not restart automatically.
