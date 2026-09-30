---
'@polymarket/bindings': patch
'@polymarket/client': patch
---

Support `CONDITIONAL-V2` balance and allowance reads and refreshes. Use the Protocol
V2 position selector for both allowance checks and post-approval refreshes when
automatically recovering a Protocol V2 sell order. Export `AssetType` from
`@polymarket/client` for explicit balance and allowance calls.
