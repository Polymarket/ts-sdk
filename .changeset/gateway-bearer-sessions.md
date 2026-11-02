---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Authenticate prediction clients through the gateway with bearer token pairs, automatic shared HTTP/WebSocket refresh, automatic L2 credential migration and session logout. `secureClient.credentials`, login, migration and credential callbacks expose plain `{ accessToken, refreshToken }` pairs. Restore signer-only sessions without wallet discovery or deployment. Replace reads of legacy credential fields and save `secureClient.credentials` after successful creation; see `docs/authentication-migration.md` before upgrading.

If creation fails after opening a new bearer session, attempt to revoke it and close local resources while preserving the original error. Defer new-session refresh notifications until setup succeeds. Caller-supplied bearer sessions are not revoked when restoration fails.
