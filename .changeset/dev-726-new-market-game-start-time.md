---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

`gameStartTime` on new-market events and market notifications now normalizes space-separated and hour-only-offset datetime strings (such as `2026-10-17 23:30:00+00`) to ISO 8601; values that are already ISO 8601 are unchanged. An empty upstream value is now `null` instead of an empty string, and a string that names an impossible date or time fails validation instead of throwing.
