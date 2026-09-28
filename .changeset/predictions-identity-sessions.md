---
"@polymarket/client": minor
"@polymarket/bindings": minor
---

Create fresh trading credentials through the authentication exchange and add openPredictionsSession() for managed wallet identity sessions. Sessions validate ownership challenges before signing, refresh on demand, expose fetchIdentity(), and support explicit retryable logout. Add client.fetchIdentity() for platform API key identity.
