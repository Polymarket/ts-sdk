---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add Perps Builder Codes with explicit owner-signed fee approval and revocation.
Approving a builder updates the session's attribution after confirmation; revoking
clears it after confirmation. Approval versions are managed internally.

An optional builder address at session setup restores the trader's active saved
approval. The lower of the approved maximum and builder cap applies consistently
to single orders, batches, and TP/SL exits. New approvals refresh the builder cap
and replace the session rate after confirmation. Setup never creates consent.

Preserve builder terms on orders and expose `builderFee` and `totalFee` on fills;
`fee` continues to mean the exchange fee. Legacy responses normalize to zero
builder fee. Existing untagged order signatures are unchanged.

Expose typed builder earnings reporting and opt-in builder receipts through the
existing session iterator with `includeBuilderFills`. This extends the experimental
`PerpsSessionEvent` union with `builderFill`. Historical reconciliation remains
application-owned. Failed consent submissions are not automatically retried.
