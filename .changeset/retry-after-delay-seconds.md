---
"@polymarket/client": minor
---

Intentionally accept only ASCII whole-second Retry-After headers, from 0 through 9,007,199,254,740,991, matching the Python SDK. Leading zeros and surrounding ASCII spaces or tabs are allowed. Remove HTTP-date support and ignore signed, fractional, exponent, non-finite, and oversized values. Missing or invalid headers retain the existing rejection-body delay fallback and default rate-limit waits. Oversized digit strings no longer expose Infinity as retry metadata.
