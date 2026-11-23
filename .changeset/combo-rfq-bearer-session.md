---
'@polymarket/client': minor
'@polymarket/bindings': patch
---

Combo RFQ runs on the bearer session alone. Without a builder API key, `requestComboQuote`, `acceptComboQuote`, `fetchRfqStatus` and `waitForComboFill` use the requester routes instead of rejecting the call. These RFQs have no builder attribution, their quotes carry the zero builder code, and EOA wallets aren't accepted. With a builder key, nothing changes. The builder RFQ response schema accepts a missing `builder_code` and reads it as the zero builder code.
