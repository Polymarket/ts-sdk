---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add perps auto-cancel (dead man's switch) support. `PerpsSession.armAutoCancel` schedules a signed one-shot cancel-all at a future time (at least 5 seconds ahead), `disarmAutoCancel` clears the schedule without firing, and `fetchAutoCancelStatus` reads the account's auto-cancel status, including the deadline (`null` when unarmed) and daily trigger usage. Arming past the daily trigger limit is rejected with the new `AutoCancelDailyLimitError`.
