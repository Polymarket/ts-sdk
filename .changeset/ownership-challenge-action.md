---
'@polymarket/client': minor
---

Add `createOwnershipChallenge` to `@polymarket/client/actions`. Login and backend challenge proxies now create the challenge with the same action, attributed to the application key the client is configured with. It replaces `createPlatformChallenge` and `PlatformChallengeRequest` from `@polymarket/client/node` in `1.0.0-next.0`; `platformApiKey` stays in `@polymarket/client/node`.
