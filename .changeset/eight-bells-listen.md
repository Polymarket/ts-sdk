---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add Perps account notifications support: `session.listNotifications()` with SDK-owned keyset pagination (including a `sinceSeq` backfill bound pinned across pages), `session.fetchUnreadNotificationsCount()`, `session.markNotificationsRead()` by ids or `upTo` a notification, and the `notifications` session WebSocket channel emitting typed `notification` events.
