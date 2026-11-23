---
'@polymarket/client': major
---

**Breaking:** `createOwnershipChallenge` takes the signer as `signerAddress`, like `publicClient.migrateCredentials`. `remotePlatformApiKey` sends the same field to your challenge proxy, so a proxy that passes the body to `createOwnershipChallenge` works unchanged; one that reads `signer` from the body must read `signerAddress`. The unused `SetupGaslessWalletError` export is removed.
