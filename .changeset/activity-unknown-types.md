---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Parse activity rows with types this SDK version does not enumerate instead of failing the page. They return as `UnknownActivity` with `type: undefined` and the served type in `rawType`.
