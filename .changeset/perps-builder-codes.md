---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add Perps Builder Codes with optional `builderAttribution` session defaults and per-placement overrides,
explicit opt-out, owner-signed fee approvals, and typed earnings reporting.

Preserve builder terms on orders and expose `builderFee` and `totalFee` on fills;
`fee` continues to mean the exchange fee. Legacy responses normalize to zero
builder fee. Existing untagged order signatures and session event types are unchanged.

Add an opt-in builder receipt stream with independent handles and reconnect
signals. Historical reconciliation remains application-owned. Perps remains experimental.

Add `session.approveBuilderFee()` with optional parameters: inherit builder terms
from that session and resolve the next approval version automatically. Explicit
parameters override defaults. The parent secure client's owner signer signs
consent; the session's delegated credentials read the saved approval. Failed
submissions are not automatically retried.
