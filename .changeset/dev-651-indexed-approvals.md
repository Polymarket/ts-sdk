---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Read trading approval state from the indexed approvals endpoint while keeping
trading setup checks on chain. Recent grants and revocations may take time to
appear in reads. Return shapes and required approvals are unchanged.

Reads now follow the configured data endpoint, independently of RPC overrides,
and surface its failures without an RPC fallback. This includes rejected zero
and protocol-contract wallets, rate limits, and unavailable environments.
Incomplete or mismatched approval snapshots raise `UnexpectedResponseError`.
