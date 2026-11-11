---
'@polymarket/client': minor
---

Add `secureClient.refreshCredentials()` to renew the bearer session on demand. A call made while a renewal is in progress joins it, `onCredentialsChanged` receives the renewed pair, and failures are documented as `RefreshCredentialsError`.
