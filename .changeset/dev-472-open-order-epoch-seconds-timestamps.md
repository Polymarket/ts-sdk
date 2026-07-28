---
"@polymarket/bindings": patch
---

Open order `createdAt` and `expiresAt` now parse epoch-seconds wire timestamps correctly instead of treating them as milliseconds.
