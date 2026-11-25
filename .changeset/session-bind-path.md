---
'@polymarket/client': minor
---

`upgradeCredentials` and wallet setup bind the session through `/v1/auth/bind`. A session bound to another wallet now binds the requested wallet in its place, instead of rejecting it with `UserInputError`. A bind renews a token close to expiry first, except after a transient renewal failure. A short-lived bound token renews at once. `createSecureClient` rejects restored credentials with an explicit `wallet` when another client rebinds the session to another wallet during setup.
