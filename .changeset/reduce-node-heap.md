---
'@polymarket/client': patch
'@polymarket/bindings': patch
---

Reduce Node.js startup allocations with supported ox namespace imports, narrower
internal action imports, and a Zod minimum of 4.4.3. Refresh the workspace's Zod
lock without changing existing validation diagnostics.

Add `@polymarket/client/hmac` for using the existing WebCrypto signing helper
without loading client actions and response schemas. Existing entry points and
root exports remain available.
