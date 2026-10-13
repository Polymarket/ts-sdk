---
'@polymarket/client': patch
---

Support an optional scalar or array `version` filter on `listEvents`, using the existing `ProtocolVersion.V1` and `ProtocolVersion.V2` values. The filter is retained on continuation pages and is part of query-bound cursors. Arrays accept one or two supported values and serialize as repeated query parameters. Omission uses the current server default of CTF events (v1).
