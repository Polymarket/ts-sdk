---
"@polymarket/client": patch
---

Add `createBaseClient`, a low-level factory that creates a client without bound action methods for consumers that call standalone actions directly and want per-action tree-shaking.
