---
"@polymarket/bindings": patch
---

Add the DEPOSIT, WITHDRAWAL, and TAKER_REBATE activity types to the ActivityType enum, model them as typed account-level activities, and parse them in ActivitySchema so activity responses containing these rows no longer fail validation.
