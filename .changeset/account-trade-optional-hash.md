---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Accept account trades without a transaction hash so a fill without one does not invalidate the entire page. Missing and empty hashes normalize to `undefined`; populated hashes are unchanged.
