---
"@polymarket/client": patch
---

Keep unrestricted RFQ salt generation local and reject CLOB order salts that
cannot be serialized exactly as JavaScript numbers.
