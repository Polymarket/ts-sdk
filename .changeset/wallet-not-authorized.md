---
'@polymarket/client': patch
---

Report a `wallet` the signer cannot use, such as one that was never deployed, as `UserInputError` from `createSecureClient` and `publicClient.login`. The API rejects it before anything is signed, and its rejection stays available as the error's `cause`.
