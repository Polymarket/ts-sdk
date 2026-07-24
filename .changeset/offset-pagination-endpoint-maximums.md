---
"@polymarket/client": patch
---

Offset pagination no longer silently truncates results when pageSize equals the endpoint maximum on activity, trades, positions, and closed positions. Page sizes above the endpoint maximum are now rejected with a UserInputError instead of returning a silently shrunken page.
