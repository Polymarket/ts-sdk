---
'@polymarket/client': minor
---

`secureClient.bindCredentials` replaces `upgradeCredentials`, which stays as a deprecated name, and `BindCredentialsError` replaces `UpgradeCredentialsError`. The bind and wallet setup use `/v1/auth/bind`. A session bound to another wallet now binds the requested wallet in its place, instead of rejecting it with `UserInputError`. That bind ends the open user subscriptions with `TransportError`. A bind renews a token close to expiry first, except after a transient renewal failure. A short-lived bound token renews at once. A bind that times out renews the session before it throws, so `account.wallet` names the wallet that the server reports. `createSecureClient` rejects restored credentials with an explicit `wallet` when another client rebinds the session to another wallet during setup.
