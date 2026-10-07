---
"@polymarket/client": minor
---

Add an internal gateway client that attaches the package version and detected runtime in the POLYMARKET_CLIENT header. Runtime detection is local and best effort; unsupported runtimes use unknown metadata. Existing discovery routes and authentication flows remain unchanged.
