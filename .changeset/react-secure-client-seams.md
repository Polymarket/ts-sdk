---
"@polymarket/client": patch
---

Add `createBaseSecureClient`, a low-level factory that restores an authenticated client from existing session credentials without bound action methods and without running an authentication workflow. Promote `beginAuthentication` to the public API and export the workflow request/response vocabulary types from the root entry point.
