---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add perps auto-cancel (dead man's switch) support. `PerpsSession.armAutoCancel` schedules a signed one-shot cancel-all at a future time, `clearAutoCancel` disarms it without firing, and `fetchAutoCancel` reads the account's auto-cancel status, including the deadline and daily trigger usage. Arming past the daily trigger limit is rejected with the new `AutoCancelDailyLimitError`.
