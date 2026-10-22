---
"@polymarket/client": minor
---

Remove the public `fetchApiKeys`, `deleteApiKey`, `createBuilderApiKey` and `fetchBuilderApiKeys` actions and their error exports. Saved L2 sessions retain internal credential validation and logout revocation.

Preserve generic messages for unexpected sensitive transport failures, including failures that contain a credential requiring redaction.
