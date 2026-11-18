---
'@polymarket/client': minor
---

Add `secureClient.upgradeCredentials({ wallet })` to bind a wallet to a session that has none, such as after onboarding that started with `walletSetup: false`. It binds the wallet on the existing client without a new signature and returns the new `BearerCredentials`. The client's `account` moves to the wallet and its subscriptions stay open. Failures are reported as `UpgradeCredentialsError`.
