---
'@polymarket/client': minor
---

Add a separate callback-only AuthenticatedServiceClient. Owning clients resolve all authentication headers and accept refresh results; the transport stores no credentials and permits one bounded replay after an unauthorized response, except on authentication endpoints.
