---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Support `position_deleveraged` notifications in Perps notification history and the existing session event iterator. The new notification includes the closed size, settlement price, realized PnL, and margin type. Perps remains experimental; exhaustive notification switches should handle this variant.
