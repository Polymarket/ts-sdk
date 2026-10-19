---
"@polymarket/client": patch
---

Default HTTP requests to a 30-second timeout, including RPC. Add experimental per-read `timeout` alongside `signal`: pass milliseconds or `false` to disable the timeout for each request, including pagination.
