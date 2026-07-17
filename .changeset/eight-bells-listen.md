---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add Perps account notifications support: `session.listNotifications()` with SDK-owned keyset pagination (including `sinceSeq` backfill pinned across pages and per-page `unread` / `durableSourceSeq` metadata), `session.markNotificationsRead()` by ids or `upTo` a notification, and the `notifications` session WebSocket channel emitting `notification` events plus server-sent `resync` events (`reason: 'server'`).
