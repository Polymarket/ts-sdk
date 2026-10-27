---
"@polymarket/client": minor
---

Remove direct API-key creation, derivation and management actions. Supplied L2 credentials are automatically exchanged for bearer credentials during client creation, without a new wallet signature. Bearer login, migration, refresh and logout use the gateway.
