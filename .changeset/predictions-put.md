---
'@polymarket/client': minor
---

Add `put` to the experimental `predictions` service client. Like the other mutations, a PUT request is sent once, and a secure client replays it once after an `expired_access_token` rejection.
