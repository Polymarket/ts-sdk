---
"@polymarket/client": patch
---

Send excludeDepositsWithdrawals=false on activity requests whenever the type filter includes DEPOSIT or WITHDRAWAL. The endpoint excludes those rows by default and strips both values from the type filter, so requesting them previously returned no deposit or withdrawal rows.
