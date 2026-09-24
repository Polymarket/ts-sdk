---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add Perps Builder Codes with optional `perpsBuilderAttribution` secure-client defaults, `builderAttribution` session and per-placement overrides,
explicit opt-out, owner-signed fee approvals, and typed earnings reporting.

Preserve builder terms on orders and expose `builderFee` and `totalFee` on fills;
`fee` continues to mean the exchange fee. Legacy responses normalize to zero
builder fee. Existing untagged order signatures and session event types are unchanged.

Add an opt-in builder receipt stream with independent handles and reconnect
signals. Historical reconciliation remains application-owned. Perps remains experimental.

Allow `approvePerpsBuilderFee()` to inherit builder terms from a selected session
or the secure client, and resolve the next approval version automatically.
Explicit parameters override defaults. Version lookup reuses an open session or
opens and closes a temporary session with one-minute credentials; creating those
credentials requires an additional owner signature. Pass `session` when multiple
sessions are open. Failed submissions are not automatically retried.
