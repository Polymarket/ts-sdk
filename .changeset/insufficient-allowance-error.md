---
"@polymarket/client": patch
---

Add `InsufficientAllowanceError`, thrown when order posting is rejected because the account's balance or token allowance cannot fund the order. Previously this surfaced as a generic `RequestRejectedError` whose message had to be string-matched; the rejection is now typed at the posting boundary and included in the `PostOrderError`, `PostOrdersError`, `PlaceMarketOrderError`, and `PlaceLimitOrderError` unions. The internal allowance-recovery detection now uses the typed error.
