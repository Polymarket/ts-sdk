---
'@polymarket/client': patch
---

Remove `verificationToken` from `createSecureClient` options, added in `1.0.0-next.0`. When sign-in requires a verification token, pass it to `publicClient.login` or `publicClient.migrateCredentials`, then create the client from the returned credentials with `walletSetup: false`.
