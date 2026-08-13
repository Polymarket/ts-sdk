---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Type notification payloads: `Notification` is now a discriminated union on the new `NotificationType` enum, `owner` is the branded `ApiKey`, and each notification kind carries a typed `payload` instead of `unknown`.

At runtime, notification kinds unknown to this SDK version are omitted from `fetchNotifications`, while recognized kinds whose payloads do not match their schemas reject the entire response.

Malformed combo condition IDs, question IDs, EVM addresses, and transaction hashes now report schema validation failures instead of escaping parsing as raw errors.
