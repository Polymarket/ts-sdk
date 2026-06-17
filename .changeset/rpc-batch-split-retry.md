---
"@polymarket/client": patch
---

Retry rejected JSON-RPC `eth_call` batches by recursively splitting them into smaller batches.
