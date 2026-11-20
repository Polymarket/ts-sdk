---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add server-only `platformApiKey` and browser-compatible `remotePlatformApiKey` adapters with challenge-only proxying and the shared bearer session lifecycle. Backend challenge routes create the challenge with `createOwnershipChallenge`. Keep builder or submission authorization alongside the platform key with `submissionApiKey`. Authentication transport errors stay generic for untyped failures and redact credential values.
