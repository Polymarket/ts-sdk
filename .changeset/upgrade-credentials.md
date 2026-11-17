---
'@polymarket/client': minor
---

Add `secureClient.upgradeCredentials({ wallet })` to bind a wallet to a session that has none, such as after onboarding that started with `walletSetup: false`. It returns a client for that wallet without a new signature, closes the original client without ending the session, and reports failures as `UpgradeCredentialsError`.
