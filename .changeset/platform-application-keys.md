---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add server-only `platformApiKey` and browser-compatible `remotePlatformApiKey` adapters with challenge-only proxying and the shared bearer session lifecycle. Add `createPlatformChallenge` to `@polymarket/client/node` for the backend challenge route. Keep builder or submission authorization alongside the platform key with `submissionApiKey`. Gasless actions accept any bearer session. Authentication transport errors stay generic for untyped failures and redact credential values.
