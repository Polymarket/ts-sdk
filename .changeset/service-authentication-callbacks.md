---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add a separate callback-only AuthenticatedServiceClient.

**Breaking:** reads no longer retry by default. `retries` now defaults to 0 instead of 2. To keep the previous behavior, pass `{ retries: 2 }` to each read. Mutations are never retried.

Owning clients resolve all authentication headers and accept refresh results; the transport stores no credentials and permits one bounded replay. Credential schemas accept exactly one complete mechanism and reject mixed or unknown fields.
