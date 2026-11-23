---
'@polymarket/client': minor
---

Gasless actions run on the bearer session alone: Deposit Wallet deployment, gasless transactions such as `transferErc20`, collateral return, and session-key authorization and revocation no longer require a builder or relayer API key. `createSecureClient` can deploy the default Deposit Wallet without one too. A builder or relayer key, directly or as `submissionApiKey`, is still accepted and still adds its headers to these requests.
