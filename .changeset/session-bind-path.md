---
'@polymarket/client': minor
---

`upgradeCredentials` and wallet setup bind the session through `/v1/auth/bind`. A session bound to another wallet now binds the requested wallet in its place, instead of rejecting it with `UserInputError`. A bind close to the token's expiry refreshes the session first.
