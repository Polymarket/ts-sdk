---
"@polymarket/client": minor
---

**Breaking:** the SDK no longer supports API key or builder API key management. These exports are removed from `@polymarket/client/actions` and have no replacement in the SDK: `createApiKey`, `deriveApiKey`, `createOrDeriveApiKey`, `fetchApiKeys`, `deleteApiKey`, `createBuilderApiKey`, `fetchBuilderApiKeys`, `revokeBuilderApiKey`, their `...Error` guards and `ApiKeyAuthRequest`. The `BeginAuthenticationRequest` type is removed from the root entry point. Saved L2 credentials still work as input to `createSecureClient`, which exchanges them for a bearer session.
