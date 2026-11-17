---
'@polymarket/client': minor
---

Add `walletSetup` to `createSecureClient`. It defaults to `true`. Pass `false` to create the client without wallet discovery, wallet binding or Deposit Wallet deployment, for example from credentials returned by `publicClient.login` or `publicClient.migrateCredentials` while the application runs its own onboarding. A later client created from the saved credentials with wallet setup enabled binds the wallet.
