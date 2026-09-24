---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add Perps Builder Codes with optional `builderAttribution` session defaults, per-placement overrides,
explicit opt-out, owner-signed fee approvals, and typed earnings reporting.

Preserve builder terms on orders and expose `builderFee` and `totalFee` on fills;
`fee` continues to mean the exchange fee. Legacy responses normalize to zero
builder fee. Existing untagged order signatures and session event types are unchanged.

Add an opt-in builder receipt stream with independent handles and reconnect
signals. Historical reconciliation remains application-owned. Perps remains experimental.
