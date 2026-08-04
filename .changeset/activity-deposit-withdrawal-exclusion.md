---
"@polymarket/client": patch
---

listActivity now returns all activity types by default, including deposits and withdrawals. The endpoint excludes DEPOSIT and WITHDRAWAL rows unless excludeDepositsWithdrawals=false and strips both values from the type filter, so the SDK now always opts out and the type filter alone decides which rows come back. Previously those rows never appeared, even when requested explicitly.
