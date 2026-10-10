---
'@polymarket/client': patch
---

Support an optional scalar `version` filter on `listEvents`, using the existing `ProtocolVersion.V1` and `ProtocolVersion.V2` values. The filter is retained on continuation pages and is part of query-bound cursors. Omitting it preserves existing event discovery behavior.
