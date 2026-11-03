---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Breaking 0.x change: `UserEvent` now includes `auto_redeem` and
`combo_auto_redeem` events, and `UserEventType` includes both types. Exhaustive
switches over the user event type must handle them, and branches that assumed a
non-order event is a trade must narrow on `type === 'trade'` instead.

Deliver automatic redemption and combination redemption events through user
subscriptions, including condition filtering. Combination condition filters
match in their 64-character, `00`/`01`-suffixed and uppercase spellings. Empty
`question`, `image` and `slug` values are returned as `null`.
