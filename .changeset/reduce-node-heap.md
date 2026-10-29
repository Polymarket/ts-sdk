---
'@polymarket/client': patch
'@polymarket/bindings': patch
---

Reduce Node.js startup allocations with supported ox namespace imports, narrower
internal action imports, and a patched Zod minimum of 4.6.7. Update the workspace
lock to address GHSA-mrhx-c7xc-m3w5 and reject oversized constrained collections
before validating their elements. Invalid union input remains rejected, while
diagnostics follow the branch selected by Zod.

Add `@polymarket/client/hmac` for using the existing WebCrypto signing helper
without loading client actions and response schemas. Existing entry points and
root exports remain available.
