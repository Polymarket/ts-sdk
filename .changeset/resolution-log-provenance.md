---
'@polymarket/bindings': patch
---

Clarify that UMA resolution lifecycle rows retain the initial RequestPrice log index while the transaction hash can identify a later lifecycle event. Do not combine those fields as a log locator. Condition-resolution fallback rows instead carry their condition event's transaction and log metadata.
