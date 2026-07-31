---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Type notification payloads: `Notification` is now a discriminated union on the new `NotificationType` enum, `owner` is the branded `ApiKey`, and each notification kind carries a typed `payload` instead of `unknown`.
