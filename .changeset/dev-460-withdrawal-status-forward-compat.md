---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Accept withdrawal statuses introduced after a client release instead of failing the response parse. Known statuses now live in the `PerpsKnownWithdrawalStatus` enum, which adds the `failed` status the withdrawal contract already includes, and `PerpsWithdrawalStatus` is widened so unrecognized statuses flow through as plain strings.
