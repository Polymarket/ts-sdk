---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

Add a separate callback-only AuthenticatedServiceClient. Restore ServiceClient to plain HTTP behavior and disable automatic transport retries.

Owning clients resolve all authentication headers and accept refresh results; the transport stores no credentials and permits one bounded replay. Shared credential schemas still reject mixed authentication mechanisms without implicit migration.
