---
'@polymarket/client': minor
---

Return from `revokeSessionKey` once the session key is removed from the active-key registry instead of waiting for on-chain confirmation. The method now returns `Promise<void>`, and `RevokeSessionKeyResult` has been removed.
