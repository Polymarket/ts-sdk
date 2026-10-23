---
"@polymarket/client": minor
---

Remove direct API-key creation, derivation and management actions. Supplied L2 credentials remain supported with local input checks, without remote validation during restoration. Ending an L2 client performs local cleanup and does not revoke its key. Bearer login, migration, refresh and logout remain available through the gateway.
