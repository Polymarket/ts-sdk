---
"@polymarket/client": minor
---

Remove HTTP-date support from Retry-After parsing. Only non-negative integer delay seconds are accepted from the header. Missing or invalid headers keep the existing body-delay fallback for rejection errors and default rate-limit wait behavior. Numeric retry metadata is unchanged.
