---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Authenticate prediction clients through the gateway with bearer token pairs, automatic shared HTTP/WebSocket refresh, L2 credential migration and session logout. Saved L2 credentials remain under `secureClient.credentials` without implicit migration; bearer sessions expose `{ type: 'bearer', accessToken, refreshToken }` at the same path. Narrow the credential union before reading mechanism-specific fields; see `docs/authentication-migration.md` before upgrading.
